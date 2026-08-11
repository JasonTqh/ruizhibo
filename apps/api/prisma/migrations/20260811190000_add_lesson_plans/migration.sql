CREATE TYPE "LessonPlanStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "lessonDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "LessonPlanStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlan_teacherId_lessonDate_idx" ON "LessonPlan"("teacherId", "lessonDate");
CREATE INDEX "LessonPlan_classId_lessonDate_idx" ON "LessonPlan"("classId", "lessonDate");
CREATE INDEX "LessonPlan_teacherId_status_idx" ON "LessonPlan"("teacherId", "status");

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
