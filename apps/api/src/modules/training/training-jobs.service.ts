import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  TrainingAssignmentStatus,
  TrainingAssignmentType,
  TrainingNotificationType,
  TrainingPermission,
  TrainingSafetyStatus,
} from "@prisma/client";
import { writeOperationalLog } from "../common/operational-logger";
import { PrismaService } from "../prisma/prisma.service";
import { TrainingAssignmentService } from "./training-assignment.service";
import { addNaturalDays, deriveSafetyStatus } from "./training.domain";

@Injectable()
export class TrainingJobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: TrainingAssignmentService,
  ) {}

  onModuleInit() {
    const intervalMs = jobIntervalMs();
    this.timer = setInterval(() => void this.runSafely(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.runSafely(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process(now = new Date()) {
    await this.processDeadlines(now);
    await this.processSafety(now);
  }

  private async processDeadlines(now: Date) {
    const assignments = await this.prisma.trainingAssignment.findMany({
      where: {
        status: {
          in: [
            TrainingAssignmentStatus.pending,
            TrainingAssignmentStatus.in_progress,
            TrainingAssignmentStatus.awaiting_safety,
          ],
        },
      },
      include: { teacher: { select: { name: true } } },
    });
    for (const assignment of assignments) {
      const remainingMs = assignment.dueAt.getTime() - now.getTime();
      const reminders: Array<{
        type: TrainingNotificationType;
        key: string;
        title: string;
        content: string;
      }> = [];
      if (remainingMs <= 3 * 24 * 60 * 60 * 1000 && remainingMs > 0) {
        reminders.push({
          type: TrainingNotificationType.deadline_three_days,
          key: "3d",
          title: "培训截止日期临近",
          content: "培训将在3天内到期，请及时继续学习。",
        });
      }
      if (remainingMs <= 24 * 60 * 60 * 1000 && remainingMs > 0) {
        reminders.push({
          type: TrainingNotificationType.deadline_one_day,
          key: "1d",
          title: "培训明日内到期",
          content: "培训将在24小时内到期，请尽快完成。",
        });
      }
      if (sameShanghaiDate(now, assignment.dueAt) && remainingMs > 0) {
        reminders.push({
          type: TrainingNotificationType.deadline_today,
          key: "today",
          title: "培训今天到期",
          content: "今天是本轮培训截止日，逾期后仍可继续学习。",
        });
      }
      if (remainingMs <= 0) {
        reminders.push({
          type: TrainingNotificationType.assignment_overdue,
          key: "overdue",
          title: "培训任务已逾期",
          content: "任务已逾期，但不会限制其他业务功能，请继续完成培训。",
        });
      }
      for (const reminder of reminders) {
        await this.prisma.trainingNotification.upsert({
          where: { dedupeKey: `deadline:${assignment.id}:${reminder.key}` },
          update: {},
          create: {
            userId: assignment.teacherId,
            type: reminder.type,
            title: reminder.title,
            content: reminder.content,
            assignmentId: assignment.id,
            dedupeKey: `deadline:${assignment.id}:${reminder.key}`,
          },
        });
      }
      if (remainingMs <= 0) {
        const managers = await this.prisma.trainingPermissionGrant.findMany({
          where: {
            permission: TrainingPermission.training_manage,
            isActive: true,
            scopeKey: { in: ["GLOBAL", assignment.campusId] },
          },
          select: { userId: true },
        });
        for (const manager of managers) {
          await this.prisma.trainingNotification.upsert({
            where: {
              dedupeKey: `overdue-manager:${assignment.id}:${manager.userId}`,
            },
            update: {},
            create: {
              userId: manager.userId,
              type: TrainingNotificationType.assignment_overdue,
              title: "教师培训已逾期",
              content: `${assignment.teacher.name}的培训任务已逾期。`,
              assignmentId: assignment.id,
              dedupeKey: `overdue-manager:${assignment.id}:${manager.userId}`,
            },
          });
        }
      }
    }
  }

  private async processSafety(now: Date) {
    const credentials = await this.prisma.trainingSafetyCredential.findMany({
      where: {
        validUntil: { not: null },
        status: {
          in: [
            TrainingSafetyStatus.valid,
            TrainingSafetyStatus.expiring,
            TrainingSafetyStatus.retraining_required,
          ],
        },
      },
    });
    for (const credential of credentials) {
      const nextStatus = deriveSafetyStatus({
        now,
        validUntil: credential.validUntil,
      });
      if (nextStatus !== credential.status) {
        await this.prisma.trainingSafetyCredential.update({
          where: { id: credential.id },
          data: { status: nextStatus },
        });
      }
      if (
        nextStatus === TrainingSafetyStatus.expiring ||
        nextStatus === TrainingSafetyStatus.retraining_required
      ) {
        const source = await this.prisma.trainingAssignment.findFirst({
          where: {
            teacherId: credential.teacherId,
            status: TrainingAssignmentStatus.completed,
            safetyRecords: { some: { action: "confirmed" } },
          },
          orderBy: { completedAt: "desc" },
          select: { id: true },
        });
        let retraining = null;
        if (source && credential.validUntil) {
          retraining = await this.assignments.createSystemSafetyRetraining({
            teacherId: credential.teacherId,
            campusId: credential.campusId,
            dueAt:
              credential.validUntil.getTime() > now.getTime()
                ? credential.validUntil
                : addNaturalDays(now, 1),
            sourceAssignmentId: source.id,
          });
        }
        const activeAssignment = retraining
          ? null
          : await this.prisma.trainingAssignment.findFirst({
              where: {
                teacherId: credential.teacherId,
                activeSlot: credential.teacherId,
              },
              select: { type: true, sourceAssignmentId: true },
            });
        const hasCurrentRetraining =
          Boolean(retraining) ||
          (activeAssignment?.type === TrainingAssignmentType.safety_retraining &&
            activeAssignment.sourceAssignmentId === source?.id);
        const notificationType =
          nextStatus === TrainingSafetyStatus.expiring
            ? TrainingNotificationType.safety_expiring
            : TrainingNotificationType.safety_retraining;
        const notificationTitle =
          nextStatus === TrainingSafetyStatus.expiring
            ? "安全培训即将到期"
            : "安全培训需要复训";
        const notificationContent = hasCurrentRetraining
          ? "系统已生成安全复训任务；逾期不会限制其他业务功能。"
          : "当前已有其他有效培训任务；任务处理完成后系统会继续尝试生成安全复训。";
        await this.prisma.trainingNotification.upsert({
          where: {
            dedupeKey: `safety-expiring:${credential.id}:${credential.validUntil?.toISOString()}`,
          },
          update: {
            type: notificationType,
            title: notificationTitle,
            content: notificationContent,
          },
          create: {
            userId: credential.teacherId,
            type: notificationType,
            title: notificationTitle,
            content: notificationContent,
            dedupeKey: `safety-expiring:${credential.id}:${credential.validUntil?.toISOString()}`,
          },
        });
      }
    }
  }

  private async runSafely() {
    try {
      await this.process();
    } catch (error) {
      writeOperationalLog("error", "training_jobs_failed", {
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
    }
  }
}

function jobIntervalMs() {
  const configured = Number(process.env.TRAINING_JOB_INTERVAL_MS ?? 15 * 60 * 1000);
  return Number.isFinite(configured) && configured >= 60_000
    ? Math.floor(configured)
    : 15 * 60 * 1000;
}

function sameShanghaiDate(left: Date, right: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(left) === formatter.format(right);
}
