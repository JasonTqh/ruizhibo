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
if (
  !["create-absence", "create-conflicting-absence"].includes(command) ||
  !studentId ||
  !teacherId
) {
  throw new Error(
    "Usage: tsx pickup-verification-fixture.ts <create-absence|create-conflicting-absence> <studentId> <teacherId>",
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const data = {
      studentId,
      teacherId,
      type: AttendanceType.absence,
      happenedAt: new Date(),
      remark:
        command === "create-conflicting-absence"
          ? "Pickup verification pre-existing conflict"
          : "Pickup verification absence",
    };
    const event =
      command === "create-conflicting-absence"
        ? await prisma.$transaction(async (transaction) => {
            if (
              process.env.PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE !== "1"
            ) {
              throw new Error(
                "Conflict fixture requires PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE=1",
              );
            }
            // Verification-only escape hatch for simulating a conflict that
            // predates the CP-33.1 database trigger. SET LOCAL is scoped to
            // this isolated transaction and must never be used by app code.
            await transaction.$executeRawUnsafe(
              "SET LOCAL session_replication_role = replica",
            );
            return transaction.attendanceEvent.create({
              data,
              select: { id: true },
            });
          })
        : await prisma.attendanceEvent.create({
            data,
            select: { id: true },
          });
    process.stdout.write(event.id);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ATTENDANCE_PICKUP_CONFLICT")) {
    process.stdout.write(`ATTENDANCE_PICKUP_CONFLICT: ${message}`);
  } else {
    process.stderr.write(message);
  }
  process.exitCode = 1;
});
