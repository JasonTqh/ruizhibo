CREATE TABLE "StudentDailyReportNote" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "teacherId" TEXT,
  "comment" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentDailyReportNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentDailyReportNote_studentId_serviceDate_key"
ON "StudentDailyReportNote"("studentId", "serviceDate");

CREATE INDEX "StudentDailyReportNote_serviceDate_idx"
ON "StudentDailyReportNote"("serviceDate");

CREATE INDEX "StudentDailyReportNote_teacherId_serviceDate_idx"
ON "StudentDailyReportNote"("teacherId", "serviceDate");

ALTER TABLE "StudentDailyReportNote"
ADD CONSTRAINT "StudentDailyReportNote_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentDailyReportNote"
ADD CONSTRAINT "StudentDailyReportNote_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
