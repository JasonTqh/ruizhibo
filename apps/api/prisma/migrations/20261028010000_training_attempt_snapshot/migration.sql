ALTER TABLE "TrainingCourseAttempt" ADD COLUMN "snapshotId" TEXT;
UPDATE "TrainingCourseAttempt" AS attempt SET "snapshotId" = course."snapshotId"
FROM "TrainingAssignmentCourse" AS course WHERE attempt."assignmentCourseId" = course."id";
ALTER TABLE "TrainingCourseAttempt" ADD CONSTRAINT "TrainingCourseAttempt_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrainingCourseSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TrainingCourseAttempt_snapshotId_idx" ON "TrainingCourseAttempt"("snapshotId");
