import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  TrainingAssignmentStatus,
  TrainingAttemptStatus,
  TrainingCourseStatus,
  TrainingNotificationType,
  TrainingPermission,
  TrainingPracticalConclusion,
  TrainingSafetyStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateCourseState } from "./training.domain";
import { TrainingAuditService } from "./training-audit.service";
import type { TrainingCourseSnapshotPayload } from "./training.types";

@Injectable()
export class TrainingLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TrainingAuditService,
  ) {}

  async recomputeAttempt(courseAttemptId: string) {
    return this.prisma.$transaction((tx) =>
      this.recomputeAttemptInTransaction(tx, courseAttemptId),
    );
  }

  async recomputeAttemptInTransaction(
    tx: Prisma.TransactionClient,
    courseAttemptId: string,
  ) {
    const attempt = await tx.trainingCourseAttempt.findUnique({
      where: { id: courseAttemptId },
      include: {
        assignmentCourse: {
          include: {
            snapshot: true,
            assignment: true,
          },
        },
        chapterProgress: true,
        quizAttempts: { orderBy: { submittedAt: "desc" } },
        practicalChecks: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!attempt) throw new NotFoundException("课程学习记录不存在");
    if (attempt.status === TrainingAttemptStatus.superseded) return attempt;

    const payload = attempt.assignmentCourse.snapshot
      .payload as unknown as TrainingCourseSnapshotPayload;
    const enabledChapterKeys = new Set(
      payload.chapters.map((chapter) => chapter.key),
    );
    const completedChapterCount = attempt.chapterProgress.filter(
      (item) => item.completedAt && enabledChapterKeys.has(item.chapterKey),
    ).length;
    const latestPractical = attempt.practicalChecks[0];
    const nextCourseStatus = evaluateCourseState({
      chapterCount: payload.chapters.length,
      completedChapterCount,
      accumulatedSeconds: attempt.accumulatedSeconds,
      minimumMinutes: payload.course.minimumMinutes,
      quizRequired: Boolean(payload.quiz),
      quizPassed: attempt.quizAttempts.some((item) => item.passed),
      practicalRequired: payload.course.requiresPractical,
      practicalPassed:
        latestPractical?.conclusion === TrainingPracticalConclusion.passed,
      isSafety: payload.course.isSafety,
    });

    const nextAttemptStatus = this.toAttemptStatus(nextCourseStatus);
    const terminalLearningStatuses: TrainingCourseStatus[] = [
      TrainingCourseStatus.completed,
      TrainingCourseStatus.awaiting_practical,
      TrainingCourseStatus.awaiting_safety,
    ];
    const terminalLearning = terminalLearningStatuses.includes(nextCourseStatus);
    const beforeStatus = attempt.assignmentCourse.status;
    await tx.trainingCourseAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextAttemptStatus,
        learningCompletedAt: terminalLearning
          ? attempt.learningCompletedAt ?? new Date()
          : null,
        completedAt:
          nextCourseStatus === TrainingCourseStatus.completed
            ? new Date()
            : null,
      },
    });
    await tx.trainingAssignmentCourse.update({
      where: { id: attempt.assignmentCourseId },
      data: {
        status: nextCourseStatus,
        lastLearningAt: new Date(),
        completedAt:
          nextCourseStatus === TrainingCourseStatus.completed
            ? new Date()
            : null,
      },
    });
    if (terminalLearning) {
      await tx.trainingStudySession.updateMany({
        where: { courseAttemptId: attempt.id, isActive: true },
        data: { isActive: false, endedAt: new Date() },
      });
    }

    if (beforeStatus !== nextCourseStatus) {
      await this.audit.log(
        {
          campusId: attempt.assignmentCourse.assignment.campusId,
          assignmentId: attempt.assignmentCourse.assignmentId,
          action: "course.status.auto",
          targetType: "TrainingAssignmentCourse",
          targetId: attempt.assignmentCourseId,
          before: { status: beforeStatus },
          after: { status: nextCourseStatus },
          reason: "依据章节、有效学习时长、测验和实操结果自动计算",
        },
        tx,
      );
      if (nextCourseStatus === TrainingCourseStatus.awaiting_practical) {
        const grantRecipients = await tx.trainingPermissionGrant.findMany({
          where: {
            permission: TrainingPermission.practical_confirm,
            isActive: true,
            scopeKey: {
              in: ["GLOBAL", attempt.assignmentCourse.assignment.campusId],
            },
          },
          select: { userId: true },
        });
        const recipientIds = new Set([
          ...grantRecipients.map((item) => item.userId),
          ...(attempt.assignmentCourse.assignment.mentorId
            ? [attempt.assignmentCourse.assignment.mentorId]
            : []),
        ]);
        for (const userId of recipientIds) {
          await tx.trainingNotification.upsert({
            where: {
              dedupeKey: `practical-pending:${attempt.id}:${userId}`,
            },
            update: {},
            create: {
              userId,
              type: TrainingNotificationType.practical_pending,
              title: "待实操确认",
              content: "教师已完成课程学习与测验，请完成实操检查。",
              assignmentId: attempt.assignmentCourse.assignmentId,
              assignmentCourseId: attempt.assignmentCourseId,
              dedupeKey: `practical-pending:${attempt.id}:${userId}`,
            },
          });
        }
      }
    }
    await this.advanceAfterCourse(tx, attempt.assignmentCourseId);
    return { courseStatus: nextCourseStatus, attemptStatus: nextAttemptStatus };
  }

  async advanceAfterCourse(
    tx: Prisma.TransactionClient,
    assignmentCourseId: string,
  ) {
    const current = await tx.trainingAssignmentCourse.findUnique({
      where: { id: assignmentCourseId },
      include: { assignment: true, snapshot: true },
    });
    if (!current) throw new NotFoundException("培训课程任务不存在");

    if (
      current.status === TrainingCourseStatus.completed ||
      current.status === TrainingCourseStatus.exempted
    ) {
      const orderedCourses = await tx.trainingAssignmentCourse.findMany({
        where: { assignmentId: current.assignmentId },
        orderBy: { sortOrder: "asc" },
      });
      const next = orderedCourses.find(
        (course) =>
          course.status !== TrainingCourseStatus.completed &&
          course.status !== TrainingCourseStatus.exempted,
      );
      if (next?.status === TrainingCourseStatus.locked) {
        await tx.trainingAssignmentCourse.update({
          where: { id: next.id },
          data: { status: TrainingCourseStatus.available, unlockedAt: new Date() },
        });
      }
    }

    if (current.status === TrainingCourseStatus.awaiting_safety) {
      if (current.assignment.status !== TrainingAssignmentStatus.awaiting_safety) {
        await tx.trainingAssignment.update({
          where: { id: current.assignmentId },
          data: {
            status: TrainingAssignmentStatus.awaiting_safety,
            startedAt: current.assignment.startedAt ?? new Date(),
          },
        });
      }
      await tx.trainingSafetyCredential.upsert({
        where: { teacherId: current.assignment.teacherId },
        update: {
          campusId: current.assignment.campusId,
          status: TrainingSafetyStatus.awaiting_confirmation,
        },
        create: {
          teacherId: current.assignment.teacherId,
          campusId: current.assignment.campusId,
          status: TrainingSafetyStatus.awaiting_confirmation,
        },
      });
      const recipients = await tx.trainingPermissionGrant.findMany({
        where: {
          permission: TrainingPermission.safety_confirm,
          isActive: true,
          scopeKey: { in: ["GLOBAL", current.assignment.campusId] },
        },
        select: { userId: true },
      });
      for (const recipient of recipients) {
        await tx.trainingNotification.upsert({
          where: {
            dedupeKey: `safety-pending:${current.assignmentId}:${recipient.userId}`,
          },
          update: {},
          create: {
            userId: recipient.userId,
            type: TrainingNotificationType.safety_pending,
            title: "待安全培训确认",
            content: "教师已完成安全课程学习、测验与实操，请完成最终确认。",
            assignmentId: current.assignmentId,
            assignmentCourseId: current.id,
            dedupeKey: `safety-pending:${current.assignmentId}:${recipient.userId}`,
          },
        });
      }
    }

    const remainingCourses = await tx.trainingAssignmentCourse.count({
      where: {
        assignmentId: current.assignmentId,
        status: {
          notIn: [
            TrainingCourseStatus.completed,
            TrainingCourseStatus.exempted,
          ],
        },
      },
    });
    if (
      remainingCourses === 0 &&
      current.assignment.status !== TrainingAssignmentStatus.completed &&
      current.assignment.status !== TrainingAssignmentStatus.terminated &&
      current.assignment.status !== TrainingAssignmentStatus.frozen
    ) {
      const completedAt = new Date();
      await tx.trainingAssignment.update({
        where: { id: current.assignmentId },
        data: {
          status: TrainingAssignmentStatus.completed,
          activeSlot: null,
          completedAt,
        },
      });
      await this.audit.log(
        {
          campusId: current.assignment.campusId,
          assignmentId: current.assignmentId,
          action: "assignment.status.auto",
          targetType: "TrainingAssignment",
          targetId: current.assignmentId,
          before: { status: current.assignment.status },
          after: {
            status: TrainingAssignmentStatus.completed,
            completedAt: completedAt.toISOString(),
          },
          reason: "全部课程达到完成条件，系统自动完成本轮培训",
        },
        tx,
      );
    }
  }

  private toAttemptStatus(status: TrainingCourseStatus) {
    switch (status) {
      case TrainingCourseStatus.awaiting_practical:
        return TrainingAttemptStatus.awaiting_practical;
      case TrainingCourseStatus.awaiting_safety:
        return TrainingAttemptStatus.awaiting_safety;
      case TrainingCourseStatus.completed:
        return TrainingAttemptStatus.completed;
      default:
        return TrainingAttemptStatus.in_progress;
    }
  }
}
