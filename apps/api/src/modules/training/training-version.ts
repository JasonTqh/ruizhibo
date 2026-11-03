import { ConflictException } from "@nestjs/common";
import { Prisma, TrainingCourseStatus } from "@prisma/client";

export function assertSnapshotVersion(
  snapshot: { id: string; payload: Prisma.JsonValue },
  version?: string,
) {
  const payload = snapshot.payload as { revision?: string };
  if ((version && version !== snapshot.id) || (payload.revision && !version))
    throw new ConflictException("课程已更新，请重新进入课程后操作");
}
export async function lockCurrentTrainingCourse(
  tx: Prisma.TransactionClient,
  input: {
    teacherId: string;
    courseId: string;
    attemptNumber: number;
    snapshotId: string;
    allowed: TrainingCourseStatus[];
  },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${input.teacherId}`}))`;
  const current = await tx.trainingAssignmentCourse.findUnique({
    where: { id: input.courseId },
    include: { assignment: true },
  });
  if (
    !current ||
    current.snapshotId !== input.snapshotId ||
    current.currentAttemptNumber !== input.attemptNumber ||
    !input.allowed.includes(current.status) ||
    current.assignment.teacherId !== input.teacherId ||
    current.assignment.frozenAt ||
    ["frozen", "terminated", "completed"].includes(current.assignment.status)
  )
    throw new ConflictException("课程或任务已更新，请重新进入后操作");
  return current;
}
