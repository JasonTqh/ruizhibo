DELETE FROM "TrainingPlanCourse"
WHERE "id" LIKE 'seed-training-plan-course-%'
  AND NOT EXISTS (SELECT 1 FROM "TrainingAssignment");

DELETE FROM "TrainingPlanTemplate"
WHERE "id" = 'seed-training-plan-onboarding-v1'
  AND NOT EXISTS (
    SELECT 1 FROM "TrainingAssignment" a
    WHERE a."planId" = 'seed-training-plan-onboarding-v1'
  );

DELETE FROM "TrainingCourse" course
WHERE course."id" LIKE 'seed-training-course-%'
  AND NOT EXISTS (
    SELECT 1 FROM "TrainingCourseSnapshot" snapshot
    WHERE snapshot."originalCourseId" = course."id"
  );
