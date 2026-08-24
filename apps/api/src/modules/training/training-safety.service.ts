import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  TrainingAssignmentStatus,
  TrainingAttemptStatus,
  TrainingCourseStatus,
  TrainingNotificationType,
  TrainingPermission,
  TrainingSafetyAction,
  TrainingSafetyStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConfirmSafetyDto } from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";
import {
  addCalendarMonthsClamped,
  SAFETY_VALID_MONTHS,
} from "./training.domain";

export const SAFETY_DECLARATION =
  "我已确认该教师完成全部安全培训内容，并同意其本次安全培训通过。";

@Injectable()
export class TrainingSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
  ) {}

  async pending(actorId: string) {
    const scope = await this.access.campusScope(
      actorId,
      TrainingPermission.safety_confirm,
    );
    if (scope?.length === 0) throw new ForbiddenException("没有安全确认权限");
    const assignments = await this.prisma.trainingAssignment.findMany({
      where: {
        status: TrainingAssignmentStatus.awaiting_safety,
        campusId: scope === null ? undefined : { in: scope },
      },
      orderBy: { updatedAt: "asc" },
      include: {
        teacher: { select: { id: true, name: true, phone: true } },
        campus: { select: { id: true, name: true } },
        mentor: { select: { id: true, name: true } },
        courses: {
          orderBy: { sortOrder: "asc" },
          include: {
            snapshot: true,
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              include: {
                quizAttempts: { orderBy: { submittedAt: "desc" }, take: 1 },
                practicalChecks: { orderBy: { createdAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });
    return { data: assignments };
  }

  async confirm(actorId: string, assignmentId: string, dto: ConfirmSafetyDto) {
    if (!dto.declarationAccepted || dto.declaration.trim() !== SAFETY_DECLARATION) {
      throw new ForbiddenException("必须勾选并提交完整的安全责任声明");
    }
    const context = await this.requireSafetyContext(assignmentId);
    await this.access.assertPermission(
      actorId,
      TrainingPermission.safety_confirm,
      context.assignment.campusId,
    );
    if (context.assignment.status !== TrainingAssignmentStatus.awaiting_safety) {
      throw new ConflictException("培训任务当前不处于待安全确认状态");
    }
    const now = new Date();
    const validUntil = addCalendarMonthsClamped(now, SAFETY_VALID_MONTHS);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${context.assignment.teacherId}`}))`;
      const currentAssignment = await tx.trainingAssignment.findUnique({
        where: { id: assignmentId },
        select: { status: true, activeSlot: true },
      });
      if (
        currentAssignment?.status !== TrainingAssignmentStatus.awaiting_safety ||
        currentAssignment.activeSlot !== context.assignment.teacherId
      ) {
        throw new ConflictException("培训任务当前不处于待安全确认状态");
      }
      const record = await tx.trainingSafetyRecord.create({
        data: {
          teacherId: context.assignment.teacherId,
          campusId: context.assignment.campusId,
          assignmentId,
          courseAttemptId: context.attempt.id,
          actorId,
          action: TrainingSafetyAction.confirmed,
          declaration: SAFETY_DECLARATION,
          note: dto.note?.trim() || null,
          validFrom: now,
          validUntil,
        },
      });
      await tx.trainingSafetyCredential.upsert({
        where: { teacherId: context.assignment.teacherId },
        update: {
          campusId: context.assignment.campusId,
          status: TrainingSafetyStatus.valid,
          latestRecordId: record.id,
          validFrom: now,
          validUntil,
        },
        create: {
          teacherId: context.assignment.teacherId,
          campusId: context.assignment.campusId,
          status: TrainingSafetyStatus.valid,
          latestRecordId: record.id,
          validFrom: now,
          validUntil,
        },
      });
      await tx.trainingCourseAttempt.update({
        where: { id: context.attempt.id },
        data: {
          status: TrainingAttemptStatus.completed,
          completedAt: now,
          learningCompletedAt: context.attempt.learningCompletedAt ?? now,
        },
      });
      await tx.trainingAssignmentCourse.update({
        where: { id: context.course.id },
        data: { status: TrainingCourseStatus.completed, completedAt: now },
      });
      await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: {
          status: TrainingAssignmentStatus.completed,
          activeSlot: null,
          completedAt: now,
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId: context.assignment.campusId,
          assignmentId,
          action: "safety.confirm",
          targetType: "TrainingSafetyRecord",
          targetId: record.id,
          before: { status: TrainingAssignmentStatus.awaiting_safety },
          after: {
            status: TrainingAssignmentStatus.completed,
            safetyStatus: TrainingSafetyStatus.valid,
            validUntil: validUntil.toISOString(),
            declaration: SAFETY_DECLARATION,
            note: dto.note?.trim() || null,
          },
          reason: SAFETY_DECLARATION,
        },
        tx,
      );
      return record;
    });
    return { data: result };
  }

  async revoke(actorId: string, assignmentId: string, reason: string) {
    const context = await this.requireSafetyContext(assignmentId);
    await this.access.assertPermission(
      actorId,
      TrainingPermission.safety_confirm,
      context.assignment.campusId,
    );
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${context.assignment.teacherId}`}))`;
      const [currentAssignment, credential] = await Promise.all([
        tx.trainingAssignment.findUnique({
          where: { id: assignmentId },
          select: { status: true, activeSlot: true },
        }),
        tx.trainingSafetyCredential.findUnique({
          where: { teacherId: context.assignment.teacherId },
        }),
      ]);
      const revocableStatuses: TrainingSafetyStatus[] = [
        TrainingSafetyStatus.valid,
        TrainingSafetyStatus.expiring,
      ];
      if (
        currentAssignment?.status !== TrainingAssignmentStatus.completed ||
        currentAssignment.activeSlot !== null ||
        !credential ||
        !revocableStatuses.includes(credential.status)
      ) {
        throw new ConflictException("该教师当前没有可撤销的有效安全确认");
      }
      const latestRecord = credential.latestRecordId
        ? await tx.trainingSafetyRecord.findUnique({
            where: { id: credential.latestRecordId },
            select: { assignmentId: true, action: true },
          })
        : null;
      if (
        latestRecord?.assignmentId !== assignmentId ||
        latestRecord.action !== TrainingSafetyAction.confirmed
      ) {
        throw new ConflictException("只能撤销当前有效轮次的安全确认");
      }
      const otherActive = await tx.trainingAssignment.findFirst({
        where: {
          teacherId: context.assignment.teacherId,
          activeSlot: context.assignment.teacherId,
          id: { not: assignmentId },
        },
      });
      if (otherActive) {
        throw new ConflictException("教师已有其他有效培训任务，需先处理后再撤销确认");
      }
      const record = await tx.trainingSafetyRecord.create({
        data: {
          teacherId: context.assignment.teacherId,
          campusId: context.assignment.campusId,
          assignmentId,
          courseAttemptId: context.attempt.id,
          actorId,
          action: TrainingSafetyAction.revoked,
          reason,
        },
      });
      await tx.trainingSafetyCredential.update({
        where: { teacherId: context.assignment.teacherId },
        data: {
          status: TrainingSafetyStatus.awaiting_confirmation,
          latestRecordId: record.id,
          validFrom: null,
          validUntil: null,
        },
      });
      await tx.trainingCourseAttempt.update({
        where: { id: context.attempt.id },
        data: { status: TrainingAttemptStatus.awaiting_safety, completedAt: null },
      });
      await tx.trainingAssignmentCourse.update({
        where: { id: context.course.id },
        data: { status: TrainingCourseStatus.awaiting_safety, completedAt: null },
      });
      await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: {
          status: TrainingAssignmentStatus.awaiting_safety,
          activeSlot: context.assignment.teacherId,
          completedAt: null,
        },
      });
      await tx.trainingNotification.create({
        data: {
          userId: context.assignment.teacherId,
          type: TrainingNotificationType.safety_retraining,
          title: "安全确认已撤销",
          content: reason,
          assignmentId,
          assignmentCourseId: context.course.id,
          dedupeKey: `safety-revoked:${record.id}`,
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId: context.assignment.campusId,
          assignmentId,
          action: "safety.revoke",
          targetType: "TrainingSafetyRecord",
          targetId: record.id,
          before: {
            status: TrainingAssignmentStatus.completed,
            safetyStatus: credential.status,
            validUntil: credential.validUntil?.toISOString() ?? null,
          },
          after: {
            status: TrainingAssignmentStatus.awaiting_safety,
            safetyStatus: TrainingSafetyStatus.awaiting_confirmation,
          },
          reason,
        },
        tx,
      );
      return record;
    });
    return { data: result };
  }

  private async requireSafetyContext(assignmentId: string) {
    const assignment = await this.prisma.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        courses: {
          include: {
            snapshot: true,
            attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException("培训任务不存在");
    const course = assignment.courses.find((item) => item.snapshot.isSafety);
    const attempt = course?.attempts[0];
    if (!course || !attempt) {
      throw new ConflictException("培训任务缺少安全课程学习记录");
    }
    return { assignment, course, attempt };
  }
}
