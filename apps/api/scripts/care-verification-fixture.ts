import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { AttendanceType, PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps/api/.env"),
    resolve(__dirname, "../.env"),
  ];
  const envFile = candidates.find((candidate) => existsSync(candidate));
  if (envFile) loadEnvFile(envFile);
}

const [, , command, targetId, teacherIdOrDays] = process.argv;

async function main() {
  if (!command || !targetId) {
    throw new Error(
      "Usage: tsx care-verification-fixture.ts <create-absence|backdate-record> <targetId> <teacherId|days>",
    );
  }

  const prisma = new PrismaClient();
  try {
    if (command === "create-absence") {
      if (!teacherIdOrDays) throw new Error("teacherId is required");
      const student = await prisma.student.findUnique({
        where: { id: targetId },
        select: { id: true, name: true },
      });
      assertVerificationStudent(student?.name);
      const event = await prisma.attendanceEvent.create({
        data: {
          studentId: targetId,
          teacherId: teacherIdOrDays,
          type: AttendanceType.absence,
          happenedAt: new Date(),
          remark: "CP-35 verification absence",
        },
        select: { id: true },
      });
      process.stdout.write(event.id);
      return;
    }

    if (command === "backdate-record") {
      const days = Number(teacherIdOrDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("days must be an integer between 1 and 365");
      }
      const record = await prisma.studentCareRecord.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          student: { select: { name: true } },
          happenedAt: true,
          serviceDate: true,
        },
      });
      assertVerificationStudent(record?.student.name);
      if (!record) throw new Error("Care verification record not found");
      await prisma.studentCareRecord.update({
        where: { id: record.id },
        data: {
          happenedAt: new Date(
            record.happenedAt.getTime() - days * 24 * 60 * 60 * 1000,
          ),
          serviceDate: new Date(
            record.serviceDate.getTime() - days * 24 * 60 * 60 * 1000,
          ),
        },
      });
      process.stdout.write(record.id);
      return;
    }

    throw new Error(`Unsupported command: ${command}`);
  } finally {
    await prisma.$disconnect();
  }
}

function assertVerificationStudent(name?: string) {
  if (!name?.startsWith("verify-care-")) {
    throw new Error("Refusing to mutate non-verification care data");
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
