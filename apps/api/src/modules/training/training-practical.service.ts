import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TrainingCourseStatus,
  TrainingNotificationType,
  TrainingPermission,
  TrainingPracticalConclusion,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubmitPracticalDto } from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";
import { TrainingLifecycleService } from "./training-lifecycle.service";
import type { TrainingCourseSnapshotPayload } from "./training.types";

@Injectable()
export class TrainingPracticalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
    private readonly lifecycle: TrainingLifecycleService,
  ) {}

  async pending(actorId: string) {
    const practicalScope = await this.access.campusScope(
      actorId,
      TrainingPermission.practical_confirm,
    );
    const hasGlobal = practicalScope === null;
    const campusIds = hasGlobal
      ? null
      : [...new Set(practicalScope ?? [])];
    const items = await this.prisma.trainingAssignmentCourse.findMany({
      where: {
        status: TrainingCourseStatus.awaiting_practical,
        assignment: {
          OR: [
            { mentorId: actorId },
            ...(campusIds === null
              ? [{}]
              : campusIds.length
                ? [{ campusId: { in: campusIds } }]
                : []),
          ],
        },
      },
      orderBy: { updatedAt: "asc" },
      include: {
        snapshot: true,
        assignment: {
          include: {
            teacher: { select: { id: true, name: true, phone: true } },
            campus: { select: { id: true, name: true } },
            mentor: { select: { id: true, name: true } },
          },
        },
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
          include: {
            practicalChecks: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!items.length && campusIds?.length === 0) {
      const direct = await this.prisma.trainingAssignment.count({
        where: { mentorId: actorId },
      });
      if (!direct) throw new ForbiddenException("没有实操确认权限或带教任务");
    }
    return { data: items };
  }

  async submit(actorId: string, assignmentCourseId: string, dto: SubmitPracticalDto) {
    const course = await this.prisma.trainingAssignmentCourse.findUnique({
      where: { id: assignmentCourseId },
      include: {
        snapshot: true,
        assignment: true,
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
      },
    });
    if (!course) throw new NotFoundException("培训课程任务不存在");
    await this.access.assertPracticalReviewer({
      actorId,
      campusId: course.assignment.campusId,
      mentorId: course.assignment.mentorId,
    });
    if (course.status !== TrainingCourseStatus.awaiting_practical) {
      throw new ConflictException("该课程当前不处于待实操确认状态");
    }
    const attempt = course.attempts[0];
    if (!attempt) throw new ConflictException("课程学习尝试不存在");
    const payload = course.snapshot.payload as unknown as TrainingCourseSnapshotPayload;
    this.validateChecklist(payload, dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const check = await tx.trainingPracticalCheck.create({
        data: {
          courseAttemptId: attempt.id,
          reviewerId: actorId,
          conclusion: dto.conclusion,
          checklistResults: dto.checklist as unknown as Prisma.InputJsonValue,
          comment: dto.comment.trim(),
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId: course.assignment.campusId,
          assignmentId: course.assignmentId,
          action: "practical.submit",
          targetType: "TrainingPracticalCheck",
          targetId: check.id,
           after: {
             assignmentCourseId,
             attemptNumber: attempt.attemptNumber,
             conclusion: dto.conclusion,
             checklist: dto.checklist as unknown as Prisma.InputJsonValue,
             comment: dto.comment.trim(),
           } as Prisma.InputJsonValue,
          reason: dto.comment.trim(),
        },
        tx,
      );
      if (dto.conclusion === TrainingPracticalConclusion.retraining_required) {
        await tx.trainingNotification.create({
          data: {
            userId: course.assignment.teacherId,
            type: TrainingNotificationType.practical_retraining,
            title: "实操需要重新练习",
            content: dto.comment.trim(),
            assignmentId: course.assignmentId,
            assignmentCourseId,
            dedupeKey: `practical-retraining:${check.id}`,
          },
        });
      }
      await this.lifecycle.recomputeAttemptInTransaction(tx, attempt.id);
      return check;
    });
    return { data: result };
  }

  private validateChecklist(
    payload: TrainingCourseSnapshotPayload,
    dto: SubmitPracticalDto,
  ) {
    const configured = new Map(
      payload.practicalItems.map((item) => [item.id, item]),
    );
    const seen = new Set<string>();
    for (const result of dto.checklist) {
      if (seen.has(result.itemId)) {
        throw new BadRequestException("实操检查项目不能重复提交");
      }
      seen.add(result.itemId);
      if (!configured.has(result.itemId)) {
        throw new BadRequestException("实操检查清单包含未知项目");
      }
    }
    for (const item of payload.practicalItems) {
      if (item.isRequired && !seen.has(item.id)) {
        throw new BadRequestException("必须逐项提交所有必填实操检查项目");
      }
    }
    if (
      dto.conclusion === TrainingPracticalConclusion.passed &&
      dto.checklist.some(
        (result) => configured.get(result.itemId)?.isRequired && !result.passed,
      )
    ) {
      throw new BadRequestException("存在未通过的必填项目，不能提交总体通过");
    }
  }
}
