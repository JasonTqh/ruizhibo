ALTER TABLE "WorkflowStep"
ADD COLUMN "requirePhoto" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkflowStep" AS workflow_step
SET "requirePhoto" = template_step."requirePhoto"
FROM "WorkflowSession" AS workflow_session
JOIN "WorkflowTemplateStep" AS template_step
  ON template_step."templateId" = workflow_session."templateId"
WHERE workflow_step."sessionId" = workflow_session."id"
  AND workflow_step."stepKey" = template_step."stepKey";
