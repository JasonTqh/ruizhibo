CREATE TYPE "StudentWorkflowStepStatus" AS ENUM (
  'pending',
  'completed',
  'skipped',
  'exception'
);

CREATE TABLE "StudentWorkflowStep" (
  "id" TEXT NOT NULL,
  "workflowStepId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "StudentWorkflowStepStatus" NOT NULL DEFAULT 'pending',
  "completedAt" TIMESTAMP(3),
  "teacherId" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentWorkflowStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentWorkflowStep_workflowStepId_studentId_key"
ON "StudentWorkflowStep"("workflowStepId", "studentId");

CREATE INDEX "StudentWorkflowStep_studentId_status_idx"
ON "StudentWorkflowStep"("studentId", "status");

CREATE INDEX "StudentWorkflowStep_status_idx"
ON "StudentWorkflowStep"("status");

ALTER TABLE "StudentWorkflowStep"
ADD CONSTRAINT "StudentWorkflowStep_workflowStepId_fkey"
FOREIGN KEY ("workflowStepId") REFERENCES "WorkflowStep"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentWorkflowStep"
ADD CONSTRAINT "StudentWorkflowStep_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentWorkflowStep"
ADD CONSTRAINT "StudentWorkflowStep_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
