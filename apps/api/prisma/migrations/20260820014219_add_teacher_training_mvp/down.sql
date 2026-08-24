-- Manual rollback for 20260820014219_add_teacher_training_mvp.
-- Run only after the application has been rolled back and a verified backup
-- has been created. This removes all data created by the training module.

DROP TRIGGER IF EXISTS "TrainingCourseSnapshot_immutable" ON "TrainingCourseSnapshot";
DROP TRIGGER IF EXISTS "TrainingQuizAttempt_immutable" ON "TrainingQuizAttempt";
DROP TRIGGER IF EXISTS "TrainingPracticalCheck_immutable" ON "TrainingPracticalCheck";
DROP TRIGGER IF EXISTS "TrainingSafetyRecord_immutable" ON "TrainingSafetyRecord";
DROP TRIGGER IF EXISTS "TrainingAuditRecord_immutable" ON "TrainingAuditRecord";
DROP FUNCTION IF EXISTS "prevent_training_history_mutation"();

DROP TABLE IF EXISTS "TrainingAuditRecord";
DROP TABLE IF EXISTS "TrainingFeatureFlag";
DROP TABLE IF EXISTS "TrainingNotification";
DROP TABLE IF EXISTS "TrainingFeedback";
DROP TABLE IF EXISTS "TrainingSafetyRecord";
DROP TABLE IF EXISTS "TrainingSafetyCredential";
DROP TABLE IF EXISTS "TrainingPracticalCheck";
DROP TABLE IF EXISTS "TrainingQuizAttempt";
DROP TABLE IF EXISTS "TrainingStudySession";
DROP TABLE IF EXISTS "TrainingChapterProgress";
DROP TABLE IF EXISTS "TrainingCourseAttempt";
DROP TABLE IF EXISTS "TrainingAssignmentCourse";
DROP TABLE IF EXISTS "TrainingAssignment";
DROP TABLE IF EXISTS "TrainingPermissionGrant";
DROP TABLE IF EXISTS "TrainingCourseSnapshot";
DROP TABLE IF EXISTS "TrainingPlanCourse";
DROP TABLE IF EXISTS "TrainingPlanTemplate";
DROP TABLE IF EXISTS "TrainingPracticalTemplateItem";
DROP TABLE IF EXISTS "TrainingQuizQuestion";
DROP TABLE IF EXISTS "TrainingQuiz";
DROP TABLE IF EXISTS "TrainingChapterMedia";
DROP TABLE IF EXISTS "TrainingChapter";
DROP TABLE IF EXISTS "TrainingCourse";

ALTER TABLE "User" DROP COLUMN IF EXISTS "employmentStatus";

DROP TYPE IF EXISTS "TrainingNotificationType";
DROP TYPE IF EXISTS "TrainingStudyKind";
DROP TYPE IF EXISTS "TrainingSafetyAction";
DROP TYPE IF EXISTS "TrainingSafetyStatus";
DROP TYPE IF EXISTS "TrainingPracticalConclusion";
DROP TYPE IF EXISTS "TrainingAttemptStatus";
DROP TYPE IF EXISTS "TrainingCourseStatus";
DROP TYPE IF EXISTS "TrainingAssignmentStatus";
DROP TYPE IF EXISTS "TrainingAssignmentType";
DROP TYPE IF EXISTS "TrainingPermission";
DROP TYPE IF EXISTS "TrainingQuestionType";
DROP TYPE IF EXISTS "TrainingMediaType";
DROP TYPE IF EXISTS "TrainingContentStatus";
DROP TYPE IF EXISTS "TrainingCourseCategory";
DROP TYPE IF EXISTS "TeacherEmploymentStatus";
