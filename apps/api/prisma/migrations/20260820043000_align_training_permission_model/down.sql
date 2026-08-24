-- Compatibility rollback for the enum shape. Consolidated course-maintenance
-- grants remain training_manage grants because that conversion is intentional.
ALTER TYPE "TrainingPermission" RENAME TO "TrainingPermission_current";
CREATE TYPE "TrainingPermission" AS ENUM (
  'training_manage',
  'course_manage',
  'practical_confirm',
  'safety_confirm'
);

ALTER TABLE "TrainingPermissionGrant"
  ALTER COLUMN "permission" TYPE "TrainingPermission"
  USING ("permission"::text::"TrainingPermission");

DROP TYPE "TrainingPermission_current";
