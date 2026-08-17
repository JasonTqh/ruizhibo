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

const [, , command, studentId, teacherId] = process.argv;
if (command !== "create-absence" || !studentId || !teacherId) {
  throw new Error(
    "Usage: tsx pickup-verification-fixture.ts create-absence <studentId> <teacherId>",
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const event = await prisma.attendanceEvent.create({
      data: {
        studentId,
        teacherId,
        type: AttendanceType.absence,
        happenedAt: new Date(),
        remark: "Pickup verification absence",
      },
      select: { id: true },
    });
    process.stdout.write(event.id);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
