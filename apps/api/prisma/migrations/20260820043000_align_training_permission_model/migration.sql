-- PRD v1.1 exposes exactly three configurable permissions. Course maintenance
-- is part of a global training-management grant, so legacy course_manage
-- grants are consolidated before the enum is narrowed.
DELETE FROM "TrainingPermissionGrant" AS course_grant
USING "TrainingPermissionGrant" AS manage_grant
WHERE course_grant."permission" = 'course_manage'
  AND manage_grant."permission" = 'training_manage'
  AND course_grant."userId" = manage_grant."userId"
  AND course_grant."scopeKey" = manage_grant."scopeKey";

UPDATE "TrainingPermissionGrant"
SET "permission" = 'training_manage'
WHERE "permission" = 'course_manage';

ALTER TYPE "TrainingPermission" RENAME TO "TrainingPermission_old";
CREATE TYPE "TrainingPermission" AS ENUM (
  'training_manage',
  'practical_confirm',
  'safety_confirm'
);

ALTER TABLE "TrainingPermissionGrant"
  ALTER COLUMN "permission" TYPE "TrainingPermission"
  USING ("permission"::text::"TrainingPermission");

DROP TYPE "TrainingPermission_old";
