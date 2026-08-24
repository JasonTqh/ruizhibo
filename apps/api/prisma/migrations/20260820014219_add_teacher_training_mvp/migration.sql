-- CreateEnum
CREATE TYPE "TeacherEmploymentStatus" AS ENUM ('employed', 'resigned');

-- CreateEnum
CREATE TYPE "TrainingCourseCategory" AS ENUM ('foundation', 'business', 'safety', 'library');

-- CreateEnum
CREATE TYPE "TrainingContentStatus" AS ENUM ('draft', 'enabled', 'disabled');

-- CreateEnum
CREATE TYPE "TrainingMediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "TrainingQuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false');

-- CreateEnum
CREATE TYPE "TrainingPermission" AS ENUM ('training_manage', 'course_manage', 'practical_confirm', 'safety_confirm');

-- CreateEnum
CREATE TYPE "TrainingAssignmentType" AS ENUM ('onboarding', 'safety_retraining');

-- CreateEnum
CREATE TYPE "TrainingAssignmentStatus" AS ENUM ('pending', 'in_progress', 'awaiting_safety', 'completed', 'frozen', 'terminated');

-- CreateEnum
CREATE TYPE "TrainingCourseStatus" AS ENUM ('locked', 'available', 'in_progress', 'awaiting_practical', 'awaiting_safety', 'completed', 'exempted');

-- CreateEnum
CREATE TYPE "TrainingAttemptStatus" AS ENUM ('available', 'in_progress', 'awaiting_practical', 'awaiting_safety', 'completed', 'superseded');

-- CreateEnum
CREATE TYPE "TrainingPracticalConclusion" AS ENUM ('passed', 'retraining_required');

-- CreateEnum
CREATE TYPE "TrainingSafetyStatus" AS ENUM ('not_obtained', 'awaiting_confirmation', 'valid', 'expiring', 'retraining_required');

-- CreateEnum
CREATE TYPE "TrainingSafetyAction" AS ENUM ('confirmed', 'revoked', 'invalidated');

-- CreateEnum
CREATE TYPE "TrainingStudyKind" AS ENUM ('content', 'video');

-- CreateEnum
CREATE TYPE "TrainingNotificationType" AS ENUM ('assignment_created', 'deadline_three_days', 'deadline_one_day', 'deadline_today', 'assignment_overdue', 'practical_pending', 'practical_retraining', 'safety_pending', 'safety_expiring', 'safety_retraining', 'assignment_terminated');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employmentStatus" "TeacherEmploymentStatus" NOT NULL DEFAULT 'employed';

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TrainingCourseCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "audience" TEXT,
    "expectedMinutes" INTEGER NOT NULL DEFAULT 0,
    "minimumMinutes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiresPractical" BOOLEAN NOT NULL DEFAULT false,
    "isSafety" BOOLEAN NOT NULL DEFAULT false,
    "coverAssetId" TEXT,
    "status" "TrainingContentStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingChapter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingChapterMedia" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "type" "TrainingMediaType" NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingChapterMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "passScore" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "type" "TrainingQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswers" TEXT[],
    "score" INTEGER NOT NULL,
    "explanation" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TrainingQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPracticalTemplateItem" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TrainingPracticalTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlanTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlanCourse" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TrainingPlanCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourseSnapshot" (
    "id" TEXT NOT NULL,
    "originalCourseId" TEXT,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "category" "TrainingCourseCategory" NOT NULL,
    "minimumMinutes" INTEGER NOT NULL,
    "requiresPractical" BOOLEAN NOT NULL,
    "isSafety" BOOLEAN NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCourseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campusId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "permission" "TrainingPermission" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "mentorId" TEXT,
    "planId" TEXT,
    "type" "TrainingAssignmentType" NOT NULL DEFAULT 'onboarding',
    "roundNumber" INTEGER NOT NULL,
    "status" "TrainingAssignmentStatus" NOT NULL DEFAULT 'pending',
    "activeSlot" TEXT,
    "assignedById" TEXT,
    "sourceAssignmentId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "frozenAt" TIMESTAMP(3),
    "frozenFromStatus" "TrainingAssignmentStatus",
    "remainingDueSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignmentCourse" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "originalCourseId" TEXT,
    "snapshotId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "TrainingCourseStatus" NOT NULL DEFAULT 'locked',
    "currentAttemptNumber" INTEGER NOT NULL DEFAULT 1,
    "unlockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "exemptedAt" TIMESTAMP(3),
    "exemptReason" TEXT,
    "exemptedById" TEXT,
    "lastLearningAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignmentCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourseAttempt" (
    "id" TEXT NOT NULL,
    "assignmentCourseId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "TrainingAttemptStatus" NOT NULL DEFAULT 'available',
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "learningCompletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingChapterProgress" (
    "id" TEXT NOT NULL,
    "courseAttemptId" TEXT NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "videoPositionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "videoDurationSeconds" DOUBLE PRECISION,
    "watchedRanges" JSONB,
    "watchedPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSavedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingChapterProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingStudySession" (
    "id" TEXT NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "courseAttemptId" TEXT NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "kind" "TrainingStudyKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TrainingStudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizAttempt" (
    "id" TEXT NOT NULL,
    "courseAttemptId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPracticalCheck" (
    "id" TEXT NOT NULL,
    "courseAttemptId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "conclusion" "TrainingPracticalConclusion" NOT NULL,
    "checklistResults" JSONB NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPracticalCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSafetyCredential" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "status" "TrainingSafetyStatus" NOT NULL DEFAULT 'not_obtained',
    "latestRecordId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSafetyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSafetyRecord" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "courseAttemptId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "TrainingSafetyAction" NOT NULL,
    "declaration" TEXT,
    "note" TEXT,
    "reason" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSafetyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingFeedback" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reflection" TEXT,
    "suggestion" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TrainingNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "assignmentId" TEXT,
    "assignmentCourseId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingFeatureFlag" (
    "campusId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingFeatureFlag_pkey" PRIMARY KEY ("campusId")
);

-- CreateTable
CREATE TABLE "TrainingAuditRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "campusId" TEXT,
    "assignmentId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_code_key" ON "TrainingCourse"("code");

-- CreateIndex
CREATE INDEX "TrainingCourse_status_sortOrder_idx" ON "TrainingCourse"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingCourse_category_status_idx" ON "TrainingCourse"("category", "status");

-- CreateIndex
CREATE INDEX "TrainingChapter_courseId_isEnabled_idx" ON "TrainingChapter"("courseId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingChapter_courseId_sortOrder_key" ON "TrainingChapter"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingChapterMedia_fileAssetId_idx" ON "TrainingChapterMedia"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingChapterMedia_chapterId_sortOrder_key" ON "TrainingChapterMedia"("chapterId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingQuiz_courseId_key" ON "TrainingQuiz"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingQuizQuestion_quizId_sortOrder_key" ON "TrainingQuizQuestion"("quizId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPracticalTemplateItem_courseId_sortOrder_key" ON "TrainingPracticalTemplateItem"("courseId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanTemplate_code_key" ON "TrainingPlanTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanCourse_planId_sortOrder_key" ON "TrainingPlanCourse"("planId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanCourse_planId_courseId_key" ON "TrainingPlanCourse"("planId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingCourseSnapshot_originalCourseId_createdAt_idx" ON "TrainingCourseSnapshot"("originalCourseId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingCourseSnapshot_checksum_idx" ON "TrainingCourseSnapshot"("checksum");

-- CreateIndex
CREATE INDEX "TrainingPermissionGrant_campusId_permission_isActive_idx" ON "TrainingPermissionGrant"("campusId", "permission", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPermissionGrant_userId_permission_scopeKey_key" ON "TrainingPermissionGrant"("userId", "permission", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_activeSlot_key" ON "TrainingAssignment"("activeSlot");

-- CreateIndex
CREATE INDEX "TrainingAssignment_campusId_status_dueAt_idx" ON "TrainingAssignment"("campusId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "TrainingAssignment_mentorId_status_idx" ON "TrainingAssignment"("mentorId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_teacherId_assignedAt_idx" ON "TrainingAssignment"("teacherId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_teacherId_roundNumber_key" ON "TrainingAssignment"("teacherId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignmentCourse_snapshotId_key" ON "TrainingAssignmentCourse"("snapshotId");

-- CreateIndex
CREATE INDEX "TrainingAssignmentCourse_assignmentId_status_idx" ON "TrainingAssignmentCourse"("assignmentId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignmentCourse_originalCourseId_idx" ON "TrainingAssignmentCourse"("originalCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignmentCourse_assignmentId_sortOrder_key" ON "TrainingAssignmentCourse"("assignmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingCourseAttempt_status_lastActivityAt_idx" ON "TrainingCourseAttempt"("status", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourseAttempt_assignmentCourseId_attemptNumber_key" ON "TrainingCourseAttempt"("assignmentCourseId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingChapterProgress_courseAttemptId_chapterKey_key" ON "TrainingChapterProgress"("courseAttemptId", "chapterKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingStudySession_clientSessionId_key" ON "TrainingStudySession"("clientSessionId");

-- CreateIndex
CREATE INDEX "TrainingStudySession_courseAttemptId_isActive_idx" ON "TrainingStudySession"("courseAttemptId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingQuizAttempt_courseAttemptId_attemptNumber_key" ON "TrainingQuizAttempt"("courseAttemptId", "attemptNumber");

-- CreateIndex
CREATE INDEX "TrainingPracticalCheck_courseAttemptId_createdAt_idx" ON "TrainingPracticalCheck"("courseAttemptId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingPracticalCheck_reviewerId_createdAt_idx" ON "TrainingPracticalCheck"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSafetyCredential_teacherId_key" ON "TrainingSafetyCredential"("teacherId");

-- CreateIndex
CREATE INDEX "TrainingSafetyCredential_campusId_status_validUntil_idx" ON "TrainingSafetyCredential"("campusId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "TrainingSafetyRecord_teacherId_createdAt_idx" ON "TrainingSafetyRecord"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingSafetyRecord_campusId_action_createdAt_idx" ON "TrainingSafetyRecord"("campusId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFeedback_assignmentId_key" ON "TrainingFeedback"("assignmentId");

-- CreateIndex
CREATE INDEX "TrainingFeedback_teacherId_submittedAt_idx" ON "TrainingFeedback"("teacherId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingNotification_dedupeKey_key" ON "TrainingNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "TrainingNotification_userId_readAt_createdAt_idx" ON "TrainingNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingAuditRecord_campusId_createdAt_idx" ON "TrainingAuditRecord"("campusId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingAuditRecord_assignmentId_createdAt_idx" ON "TrainingAuditRecord"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingAuditRecord_action_createdAt_idx" ON "TrainingAuditRecord"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingChapter" ADD CONSTRAINT "TrainingChapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingChapterMedia" ADD CONSTRAINT "TrainingChapterMedia_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TrainingChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingChapterMedia" ADD CONSTRAINT "TrainingChapterMedia_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizQuestion" ADD CONSTRAINT "TrainingQuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPracticalTemplateItem" ADD CONSTRAINT "TrainingPracticalTemplateItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlanCourse" ADD CONSTRAINT "TrainingPlanCourse_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlanCourse" ADD CONSTRAINT "TrainingPlanCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourseSnapshot" ADD CONSTRAINT "TrainingCourseSnapshot_originalCourseId_fkey" FOREIGN KEY ("originalCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPermissionGrant" ADD CONSTRAINT "TrainingPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPermissionGrant" ADD CONSTRAINT "TrainingPermissionGrant_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPermissionGrant" ADD CONSTRAINT "TrainingPermissionGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlanTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignmentCourse" ADD CONSTRAINT "TrainingAssignmentCourse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignmentCourse" ADD CONSTRAINT "TrainingAssignmentCourse_originalCourseId_fkey" FOREIGN KEY ("originalCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignmentCourse" ADD CONSTRAINT "TrainingAssignmentCourse_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrainingCourseSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignmentCourse" ADD CONSTRAINT "TrainingAssignmentCourse_exemptedById_fkey" FOREIGN KEY ("exemptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourseAttempt" ADD CONSTRAINT "TrainingCourseAttempt_assignmentCourseId_fkey" FOREIGN KEY ("assignmentCourseId") REFERENCES "TrainingAssignmentCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingChapterProgress" ADD CONSTRAINT "TrainingChapterProgress_courseAttemptId_fkey" FOREIGN KEY ("courseAttemptId") REFERENCES "TrainingCourseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStudySession" ADD CONSTRAINT "TrainingStudySession_courseAttemptId_fkey" FOREIGN KEY ("courseAttemptId") REFERENCES "TrainingCourseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_courseAttemptId_fkey" FOREIGN KEY ("courseAttemptId") REFERENCES "TrainingCourseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPracticalCheck" ADD CONSTRAINT "TrainingPracticalCheck_courseAttemptId_fkey" FOREIGN KEY ("courseAttemptId") REFERENCES "TrainingCourseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPracticalCheck" ADD CONSTRAINT "TrainingPracticalCheck_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyCredential" ADD CONSTRAINT "TrainingSafetyCredential_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyCredential" ADD CONSTRAINT "TrainingSafetyCredential_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyRecord" ADD CONSTRAINT "TrainingSafetyRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyRecord" ADD CONSTRAINT "TrainingSafetyRecord_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyRecord" ADD CONSTRAINT "TrainingSafetyRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyRecord" ADD CONSTRAINT "TrainingSafetyRecord_courseAttemptId_fkey" FOREIGN KEY ("courseAttemptId") REFERENCES "TrainingCourseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSafetyRecord" ADD CONSTRAINT "TrainingSafetyRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFeedback" ADD CONSTRAINT "TrainingFeedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFeedback" ADD CONSTRAINT "TrainingFeedback_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingNotification" ADD CONSTRAINT "TrainingNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingNotification" ADD CONSTRAINT "TrainingNotification_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingNotification" ADD CONSTRAINT "TrainingNotification_assignmentCourseId_fkey" FOREIGN KEY ("assignmentCourseId") REFERENCES "TrainingAssignmentCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFeatureFlag" ADD CONSTRAINT "TrainingFeatureFlag_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFeatureFlag" ADD CONSTRAINT "TrainingFeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAuditRecord" ADD CONSTRAINT "TrainingAuditRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAuditRecord" ADD CONSTRAINT "TrainingAuditRecord_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAuditRecord" ADD CONSTRAINT "TrainingAuditRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints. These are intentionally additive and do not transform
-- or import any historical training data.
ALTER TABLE "TrainingCourse"
  ADD CONSTRAINT "TrainingCourse_duration_check"
  CHECK ("expectedMinutes" >= 0 AND "minimumMinutes" >= 0),
  ADD CONSTRAINT "TrainingCourse_safety_category_check"
  CHECK (NOT "isSafety" OR "category" = 'safety');

ALTER TABLE "TrainingQuiz"
  ADD CONSTRAINT "TrainingQuiz_pass_score_check"
  CHECK ("passScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "TrainingQuiz_max_attempts_check"
  CHECK ("maxAttempts" IS NULL OR "maxAttempts" > 0);

ALTER TABLE "TrainingQuizQuestion"
  ADD CONSTRAINT "TrainingQuizQuestion_score_check" CHECK ("score" > 0);

ALTER TABLE "TrainingPermissionGrant"
  ADD CONSTRAINT "TrainingPermissionGrant_scope_check"
  CHECK ("scopeKey" = COALESCE("campusId", 'GLOBAL'));

ALTER TABLE "TrainingAssignment"
  ADD CONSTRAINT "TrainingAssignment_deadline_check" CHECK ("dueAt" >= "assignedAt"),
  ADD CONSTRAINT "TrainingAssignment_active_slot_check"
  CHECK (
    ("status" IN ('pending', 'in_progress', 'awaiting_safety', 'frozen') AND "activeSlot" = "teacherId")
    OR
    ("status" IN ('completed', 'terminated') AND "activeSlot" IS NULL)
  );

ALTER TABLE "TrainingFeedback"
  ADD CONSTRAINT "TrainingFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "TrainingPracticalCheck"
  ADD CONSTRAINT "TrainingPracticalCheck_comment_check" CHECK (length(trim("comment")) > 0);

ALTER TABLE "TrainingSafetyRecord"
  ADD CONSTRAINT "TrainingSafetyRecord_action_fields_check"
  CHECK (
    ("action" = 'confirmed' AND length(trim(COALESCE("declaration", ''))) > 0 AND "validFrom" IS NOT NULL AND "validUntil" IS NOT NULL)
    OR
    ("action" IN ('revoked', 'invalidated') AND length(trim(COALESCE("reason", ''))) > 0)
  );

ALTER TABLE "TrainingFeatureFlag"
  ADD CONSTRAINT "TrainingFeatureFlag_reason_check" CHECK (length(trim("reason")) > 0);

-- Snapshot and append-only responsibility records are immutable at the
-- database boundary. Corrections must be represented by a new record.
CREATE FUNCTION "prevent_training_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'training history is immutable; append a new record instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TrainingCourseSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "TrainingCourseSnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_history_mutation"();

CREATE TRIGGER "TrainingQuizAttempt_immutable"
BEFORE UPDATE OR DELETE ON "TrainingQuizAttempt"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_history_mutation"();

CREATE TRIGGER "TrainingPracticalCheck_immutable"
BEFORE UPDATE OR DELETE ON "TrainingPracticalCheck"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_history_mutation"();

CREATE TRIGGER "TrainingSafetyRecord_immutable"
BEFORE UPDATE OR DELETE ON "TrainingSafetyRecord"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_history_mutation"();

CREATE TRIGGER "TrainingAuditRecord_immutable"
BEFORE UPDATE OR DELETE ON "TrainingAuditRecord"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_history_mutation"();
