import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TeacherEmploymentStatus,
  TrainingAssignmentStatus,
  TrainingAssignmentType,
  TrainingAttemptStatus,
  TrainingCourseStatus,
  TrainingNotificationType,
  TrainingPermission,
  TrainingSafetyAction,
  TrainingSafetyStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AssignTrainingDto,
  TrainingListQueryDto,
} from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";
import { TrainingCourseService } from "./training-course.service";
import {
  addNaturalDays,
  DEFAULT_TRAINING_DAYS,
  deadlineStatus,
} from "./training.domain";
import { TrainingLifecycleService } from "./training-lifecycle.service";

const activeAssignmentStatuses: TrainingAssignmentStatus[] = [
  TrainingAssignmentStatus.pending,
  TrainingAssignmentStatus.in_progress,
  TrainingAssignmentStatus.awaiting_safety,
  TrainingAssignmentStatus.frozen,
];
const mentorRoles: UserRole[] = [UserRole.teacher, UserRole.admin];

const assignmentListInclude = {
  teacher: {
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      employmentStatus: true,
    },
  },
  campus: { select: { id: true, name: true } },
  mentor: { select: { id: true, name: true } },
  courses: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      snapshot: {
        select: {
          courseCode: true,
          courseName: true,
          category: true,
          minimumMinutes: true,
          requiresPractical: true,
          isSafety: true,
        },
      },
      attempts: {
        orderBy: { attemptNumber: "desc" as const },
        take: 1,
        include: {
          quizAttempts: { orderBy: { submittedAt: "desc" as const }, take: 1 },
          practicalChecks: { orderBy: { createdAt: "desc" as const }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.TrainingAssignmentInclude;

const onboardingCourseRules = [
  ["ONBOARDING-CULTURE", false, false],
  ["ONBOARDING-COMPENSATION", false, false],
  ["ONBOARDING-GROWTH", false, false],
  ["ONBOARDING-CLASS-FLOW", true, false],
  ["ONBOARDING-CLASSROOM", true, false],
  ["ONBOARDING-FAMILY", true, false],
  ["ONBOARDING-SAFETY", true, true],
] as const;

const assignmentDetailInclude = {
  ...assignmentListInclude,
  courses: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      snapshot: true,
      attempts: {
        orderBy: { attemptNumber: "desc" as const },
        include: {
          chapterProgress: true,
          studySessions: { orderBy: { startedAt: "desc" as const } },
          quizAttempts: { orderBy: { submittedAt: "desc" as const } },
          practicalChecks: {
            orderBy: { createdAt: "desc" as const },
            include: { reviewer: { select: { id: true, name: true } } },
          },
          safetyRecords: {
            orderBy: { createdAt: "desc" as const },
            include: { actor: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
  safetyRecords: {
    orderBy: { createdAt: "desc" as const },
    include: { actor: { select: { id: true, name: true } } },
  },
  feedback: true,
  auditRecords: {
    orderBy: { createdAt: "desc" as const },
    include: { actor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TrainingAssignmentInclude;

@Injectable()
export class TrainingAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
    private readonly courses: TrainingCourseService,
    private readonly lifecycle: TrainingLifecycleService,
  ) {}

  async assign(actorId: string, dto: AssignTrainingDto) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      dto.campusId,
    );
    const assignedAt = new Date();
    const dueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : addNaturalDays(assignedAt, DEFAULT_TRAINING_DAYS);
    if (dueAt.getTime() <= assignedAt.getTime()) {
      throw new BadRequestException("截止日期必须晚于布置时间");
    }
    const plan = await this.requireOnboardingPlan();
    if (plan.courses.length !== 7) {
      throw new ConflictException("固定新教师培训计划必须包含且仅包含7门课程");
    }
    await this.assertAssignmentActors(
      dto.teacherIds,
      dto.mentorId,
      dto.campusId,
      actorId,
    );

    const assignments = await this.prisma.$transaction(async (tx) => {
      const result = [];
      for (const teacherId of [...dto.teacherIds].sort()) {
        result.push(
          await this.createOne(tx, {
            actorId,
            teacherId,
            campusId: dto.campusId,
            mentorId: dto.mentorId,
            plan,
            selectedCourses: plan.courses,
            type: TrainingAssignmentType.onboarding,
            assignedAt,
            dueAt,
            sourceAssignmentId: null,
            reason: dto.reason.trim(),
          }),
        );
      }
      return result;
    });
    return { data: assignments };
  }

  async assertCanAssign(actorId: string, campusId: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      campusId,
    );
  }

  async createNewTeacherAssignmentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      teacherId: string;
      campusId: string;
      mentorId: string;
      dueAt?: Date;
    },
  ) {
    const mentor = await tx.user.findFirst({
      where: {
        id: input.mentorId,
        status: UserStatus.active,
        role: { in: mentorRoles },
      },
      select: { id: true, role: true },
    });
    if (!mentor) {
      throw new BadRequestException("带教负责人不存在或账号已停用");
    }
    const actorHasGlobal = Boolean(
      await tx.trainingPermissionGrant.findFirst({
        where: {
          userId: input.actorId,
          permission: TrainingPermission.training_manage,
          isActive: true,
          scopeKey: "GLOBAL",
        },
        select: { id: true },
      }),
    );
    if (!actorHasGlobal) {
      const mentorAuthorized =
        mentor.role === UserRole.teacher
          ? await tx.user.findFirst({
              where: {
                id: mentor.id,
                OR: [
                  { teachingClasses: { some: { campusId: input.campusId } } },
                  {
                    trainingAssignments: {
                      some: { campusId: input.campusId },
                    },
                  },
                ],
              },
              select: { id: true },
            })
          : await tx.trainingPermissionGrant.findFirst({
              where: {
                userId: mentor.id,
                permission: {
                  in: [
                    TrainingPermission.training_manage,
                    TrainingPermission.practical_confirm,
                  ],
                },
                isActive: true,
                scopeKey: { in: ["GLOBAL", input.campusId] },
              },
              select: { id: true },
            });
      if (!mentorAuthorized) {
        throw new BadRequestException("带教负责人不属于所选校区或未获该校区授权");
      }
    }
    const plan = await this.requireOnboardingPlan(tx);
    if (plan.courses.length !== 7) {
      throw new ConflictException("固定新教师培训计划必须包含且仅包含7门课程");
    }
    const assignedAt = new Date();
    const dueAt = input.dueAt ?? addNaturalDays(assignedAt, DEFAULT_TRAINING_DAYS);
    return this.createOne(tx, {
      actorId: input.actorId,
      teacherId: input.teacherId,
      campusId: input.campusId,
      mentorId: input.mentorId,
      plan,
      selectedCourses: plan.courses,
      type: TrainingAssignmentType.onboarding,
      assignedAt,
      dueAt,
      sourceAssignmentId: null,
      reason: "新建教师账号时默认布置新教师培训",
    });
  }

  async list(actorId: string, query: TrainingListQueryDto) {
    const campusFilter = await this.authorizedCampusFilter(actorId, query.campusId);
    const now = new Date();
    const currentRounds = await this.prisma.trainingAssignment.groupBy({
      by: ["teacherId"],
      where: { campusId: campusFilter },
      _max: { roundNumber: true },
    });
    const where: Prisma.TrainingAssignmentWhereInput = {
      campusId: campusFilter,
      ...(currentRounds.length
        ? {
            OR: currentRounds.map((item) => ({
              teacherId: item.teacherId,
              roundNumber: item._max.roundNumber ?? -1,
            })),
          }
        : { id: { in: [] } }),
      teacherId: query.teacherId,
      status: query.status,
      mentorId: query.mentorId,
      teacher: {
        name: query.teacherName
          ? { contains: query.teacherName, mode: "insensitive" }
          : undefined,
        safetyCredentials: query.safetyStatus
          ? { some: { status: query.safetyStatus } }
          : undefined,
      },
      dueAt: this.deadlineWhere(query.deadlineStatus, now),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingAssignment.findMany({
        where,
        orderBy: [{ assignedAt: "desc" }, { teacherId: "asc" }],
        skip,
        take: query.pageSize,
        include: assignmentListInclude,
      }),
      this.prisma.trainingAssignment.count({ where }),
    ]);
    return {
      data: {
        items: items.map((item) => ({
          ...item,
          deadlineStatus: deadlineStatus(now, item.dueAt),
          progress: this.progress(item.courses),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  async stats(actorId: string, campusId?: string) {
    const campusFilter = await this.authorizedCampusFilter(actorId, campusId);
    const now = new Date();
    const currentRounds = await this.prisma.trainingAssignment.groupBy({
      by: ["teacherId"],
      where: { campusId: campusFilter },
      _max: { roundNumber: true },
    });
    const base: Prisma.TrainingAssignmentWhereInput = {
      campusId: campusFilter,
      ...(currentRounds.length
        ? {
            OR: currentRounds.map((item) => ({
              teacherId: item.teacherId,
              roundNumber: item._max.roundNumber ?? -1,
            })),
          }
        : { id: { in: [] } }),
    };
    const [participants, completed, learning, overdue, practical, safety, expiring, retraining] =
      await this.prisma.$transaction([
        this.prisma.trainingAssignment.count({
          where: { ...base, status: { not: TrainingAssignmentStatus.terminated } },
        }),
        this.prisma.trainingAssignment.count({
          where: { ...base, status: TrainingAssignmentStatus.completed },
        }),
        this.prisma.trainingAssignment.count({
          where: { ...base, status: TrainingAssignmentStatus.in_progress },
        }),
        this.prisma.trainingAssignment.count({
          where: { ...base, status: { in: activeAssignmentStatuses }, dueAt: { lt: now } },
        }),
        this.prisma.trainingAssignmentCourse.findMany({
          where: {
            assignment: base,
            status: TrainingCourseStatus.awaiting_practical,
          },
          distinct: ["assignmentId"],
          select: { assignmentId: true },
        }),
        this.prisma.trainingAssignment.count({
          where: { ...base, status: TrainingAssignmentStatus.awaiting_safety },
        }),
        this.prisma.trainingSafetyCredential.count({
          where: { campusId: campusFilter, status: TrainingSafetyStatus.expiring },
        }),
        this.prisma.trainingSafetyCredential.count({
          where: {
            campusId: campusFilter,
            status: TrainingSafetyStatus.retraining_required,
          },
        }),
      ]);
    return {
      data: {
        participants,
        completed,
        learning,
        overdue,
        pendingPractical: practical.length,
        pendingSafety: safety,
        safetyExpiring: expiring,
        safetyRetraining: retraining,
      },
    };
  }

  async detail(actorId: string, assignmentId: string) {
    const assignment = await this.prisma.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: assignmentDetailInclude,
    });
    if (!assignment) throw new NotFoundException("培训任务不存在");
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      assignment.campusId,
    );
    const historyScope = await this.access.campusScope(
      actorId,
      TrainingPermission.training_manage,
    );
    const history = await this.prisma.trainingAssignment.findMany({
      where: {
        teacherId: assignment.teacherId,
        id: { not: assignment.id },
        campusId:
          historyScope === null ? undefined : { in: historyScope },
      },
      orderBy: { assignedAt: "desc" },
      include: assignmentListInclude,
    });
    return {
      data: {
        ...assignment,
        deadlineStatus: deadlineStatus(new Date(), assignment.dueAt),
        progress: this.progress(assignment.courses),
        history,
      },
    };
  }

  async changeDueDate(
    actorId: string,
    assignmentId: string,
    dueAtValue: string,
    reason: string,
  ) {
    const assignment = await this.requireManageable(actorId, assignmentId);
    if (!activeAssignmentStatuses.includes(assignment.status)) {
      throw new ConflictException("已完成或已终止任务不能修改截止日期");
    }
    const dueAt = new Date(dueAtValue);
    if (dueAt.getTime() <= assignment.assignedAt.getTime()) {
      throw new BadRequestException("截止日期必须晚于布置时间");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: { dueAt },
        include: assignmentListInclude,
      });
      await this.audit.log(
        {
          actorId,
          campusId: assignment.campusId,
          assignmentId,
          action: "assignment.due_date.change",
          targetType: "TrainingAssignment",
          targetId: assignmentId,
          before: { dueAt: assignment.dueAt.toISOString() },
          after: { dueAt: dueAt.toISOString() },
          reason,
        },
        tx,
      );
      return result;
    });
    return { data: updated };
  }

  async terminate(actorId: string, assignmentId: string, reason: string) {
    const assignment = await this.requireManageable(actorId, assignmentId);
    if (!activeAssignmentStatuses.includes(assignment.status)) {
      throw new ConflictException("已完成或已终止任务不能再终止");
    }
    const updated = await this.prisma.$transaction(async (tx) =>
      this.terminateInTransaction(tx, assignment, actorId, reason),
    );
    return { data: updated };
  }

  async exemptCourse(
    actorId: string,
    assignmentCourseId: string,
    reason: string,
  ) {
    const course = await this.requireAssignmentCourse(assignmentCourseId);
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      course.assignment.campusId,
    );
    if (course.snapshot.isSafety) {
      throw new ForbiddenException("安全管理课程不能免修");
    }
    if (
      course.assignment.status === TrainingAssignmentStatus.terminated ||
      course.assignment.status === TrainingAssignmentStatus.completed ||
      course.status === TrainingCourseStatus.completed ||
      course.status === TrainingCourseStatus.exempted
    ) {
      throw new ConflictException("已完成、已免修或已终止的课程不能再次免修");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const attempt = course.attempts[0];
      if (attempt) {
        await tx.trainingCourseAttempt.update({
          where: { id: attempt.id },
          data: { status: TrainingAttemptStatus.superseded },
        });
      }
      const result = await tx.trainingAssignmentCourse.update({
        where: { id: assignmentCourseId },
        data: {
          status: TrainingCourseStatus.exempted,
          exemptedAt: new Date(),
          exemptedById: actorId,
          exemptReason: reason,
          completedAt: new Date(),
        },
      });
      if (course.assignment.status === TrainingAssignmentStatus.pending) {
        await tx.trainingAssignment.update({
          where: { id: course.assignmentId },
          data: {
            status: TrainingAssignmentStatus.in_progress,
            startedAt: new Date(),
          },
        });
      }
      await this.audit.log(
        {
          actorId,
          campusId: course.assignment.campusId,
          assignmentId: course.assignmentId,
          action: "course.exempt",
          targetType: "TrainingAssignmentCourse",
          targetId: assignmentCourseId,
          before: { status: course.status },
          after: { status: TrainingCourseStatus.exempted },
          reason,
        },
        tx,
      );
      await this.lifecycle.advanceAfterCourse(tx, assignmentCourseId);
      return result;
    });
    return { data: updated };
  }

  async relearnCourse(
    actorId: string,
    assignmentCourseId: string,
    reason: string,
  ) {
    const course = await this.requireAssignmentCourse(assignmentCourseId);
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      course.assignment.campusId,
    );
    if (course.assignment.status === TrainingAssignmentStatus.terminated) {
      throw new ConflictException("已终止任务不能发起单门重学");
    }
    if (
      course.status !== TrainingCourseStatus.completed &&
      course.status !== TrainingCourseStatus.exempted
    ) {
      throw new ConflictException("只有已完成或已免修课程可以发起单门重学");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockTeacher(tx, course.assignment.teacherId);
      const otherActive = await tx.trainingAssignment.findFirst({
        where: {
          teacherId: course.assignment.teacherId,
          activeSlot: course.assignment.teacherId,
          id: { not: course.assignmentId },
        },
        select: { id: true },
      });
      if (otherActive) {
        throw new ConflictException("教师已有其他有效培训任务，不能重开当前轮次");
      }
      const blockingPriorCourses = await tx.trainingAssignmentCourse.count({
        where: {
          assignmentId: course.assignmentId,
          sortOrder: { lt: course.sortOrder },
          status: {
            notIn: [
              TrainingCourseStatus.completed,
              TrainingCourseStatus.exempted,
            ],
          },
        },
      });
      const reopenedStatus = blockingPriorCourses
        ? TrainingCourseStatus.locked
        : TrainingCourseStatus.available;
      const previousAttempt = course.attempts[0];
      if (previousAttempt) {
        await tx.trainingCourseAttempt.update({
          where: { id: previousAttempt.id },
          data: { status: TrainingAttemptStatus.superseded },
        });
      }
      const nextNumber = course.currentAttemptNumber + 1;
      const attempt = await tx.trainingCourseAttempt.create({
        data: {
          assignmentCourseId,
          attemptNumber: nextNumber,
          status: TrainingAttemptStatus.available,
        },
      });
      await tx.trainingAssignmentCourse.update({
        where: { id: assignmentCourseId },
        data: {
          status: reopenedStatus,
          currentAttemptNumber: nextNumber,
          completedAt: null,
          exemptedAt: null,
          exemptedById: null,
          exemptReason: null,
          unlockedAt: blockingPriorCourses ? null : new Date(),
        },
      });
      await tx.trainingAssignment.update({
        where: { id: course.assignmentId },
        data: {
          status: TrainingAssignmentStatus.in_progress,
          activeSlot: course.assignment.teacherId,
          completedAt: null,
          startedAt: course.assignment.startedAt ?? new Date(),
        },
      });
      if (course.snapshot.isSafety) {
        await tx.trainingSafetyRecord.create({
          data: {
            teacherId: course.assignment.teacherId,
            campusId: course.assignment.campusId,
            assignmentId: course.assignmentId,
            courseAttemptId: attempt.id,
            actorId,
            action: TrainingSafetyAction.invalidated,
            reason,
          },
        });
        await tx.trainingSafetyCredential.upsert({
          where: { teacherId: course.assignment.teacherId },
          update: {
            campusId: course.assignment.campusId,
            status: TrainingSafetyStatus.retraining_required,
            latestRecordId: null,
            validFrom: null,
            validUntil: null,
          },
          create: {
            teacherId: course.assignment.teacherId,
            campusId: course.assignment.campusId,
            status: TrainingSafetyStatus.retraining_required,
          },
        });
        await tx.trainingNotification.create({
          data: {
            userId: course.assignment.teacherId,
            type: TrainingNotificationType.safety_retraining,
            title: "安全课程需要重学",
            content: `管理员已要求重新学习安全课程：${reason}`,
            assignmentId: course.assignmentId,
            assignmentCourseId,
            dedupeKey: `safety-manual-relearn:${attempt.id}`,
          },
        });
      }
      await this.audit.log(
        {
          actorId,
          campusId: course.assignment.campusId,
          assignmentId: course.assignmentId,
          action: "course.relearn",
          targetType: "TrainingAssignmentCourse",
          targetId: assignmentCourseId,
          before: {
            status: course.status,
            attemptNumber: course.currentAttemptNumber,
          },
          after: {
            status: reopenedStatus,
            attemptNumber: nextNumber,
          },
          reason,
        },
        tx,
      );
      return attempt;
    });
    return { data: result };
  }

  async handleTeacherAccountChange(input: {
    actorId: string;
    teacherId: string;
    previousStatus: UserStatus;
    nextStatus: UserStatus;
    previousEmploymentStatus: TeacherEmploymentStatus;
    nextEmploymentStatus: TeacherEmploymentStatus;
  }) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { teacherId: input.teacherId, activeSlot: input.teacherId },
    });
    if (!assignment) return;
    if (
      input.nextEmploymentStatus === TeacherEmploymentStatus.resigned &&
      input.previousEmploymentStatus !== TeacherEmploymentStatus.resigned
    ) {
      await this.prisma.$transaction((tx) =>
        this.terminateInTransaction(
          tx,
          assignment,
          input.actorId,
          "教师已标记离职，系统自动终止进行中的培训任务",
        ),
      );
      return;
    }
    if (
      input.nextStatus === UserStatus.disabled &&
      input.previousStatus !== UserStatus.disabled &&
      assignment.status !== TrainingAssignmentStatus.frozen
    ) {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.trainingAssignment.update({
          where: { id: assignment.id },
          data: {
            status: TrainingAssignmentStatus.frozen,
            frozenAt: now,
            frozenFromStatus: assignment.status,
            remainingDueSeconds: Math.max(
              0,
              Math.floor((assignment.dueAt.getTime() - now.getTime()) / 1000),
            ),
          },
        });
        await this.audit.log(
          {
            actorId: input.actorId,
            campusId: assignment.campusId,
            assignmentId: assignment.id,
            action: "assignment.freeze",
            targetType: "TrainingAssignment",
            targetId: assignment.id,
            before: { status: assignment.status, dueAt: assignment.dueAt.toISOString() },
            after: { status: TrainingAssignmentStatus.frozen },
            reason: "教师账号临时停用",
          },
          tx,
        );
      });
      return;
    }
    if (
      input.nextStatus === UserStatus.active &&
      input.previousStatus === UserStatus.disabled &&
      assignment.status === TrainingAssignmentStatus.frozen
    ) {
      const resumedStatus =
        assignment.frozenFromStatus === TrainingAssignmentStatus.frozen ||
        assignment.frozenFromStatus === TrainingAssignmentStatus.completed ||
        assignment.frozenFromStatus === TrainingAssignmentStatus.terminated ||
        !assignment.frozenFromStatus
          ? TrainingAssignmentStatus.pending
          : assignment.frozenFromStatus;
      const dueAt = new Date(
        Date.now() + (assignment.remainingDueSeconds ?? 0) * 1000,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.trainingAssignment.update({
          where: { id: assignment.id },
          data: {
            status: resumedStatus,
            dueAt,
            frozenAt: null,
            frozenFromStatus: null,
            remainingDueSeconds: null,
          },
        });
        await this.audit.log(
          {
            actorId: input.actorId,
            campusId: assignment.campusId,
            assignmentId: assignment.id,
            action: "assignment.resume",
            targetType: "TrainingAssignment",
            targetId: assignment.id,
            before: { status: TrainingAssignmentStatus.frozen },
            after: { status: resumedStatus, dueAt: dueAt.toISOString() },
            reason: "教师账号重新启用",
          },
          tx,
        );
      });
    }
  }

  async createSystemSafetyRetraining(input: {
    teacherId: string;
    campusId: string;
    dueAt: Date;
    sourceAssignmentId: string;
  }) {
    const plan = await this.requireOnboardingPlan();
    const safetyCourses = plan.courses.filter((item) => item.course.isSafety);
    if (safetyCourses.length !== 1) {
      throw new ConflictException("固定培训计划必须且只能包含一门安全课程");
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockTeacher(tx, input.teacherId);
      const active = await tx.trainingAssignment.findFirst({
        where: { teacherId: input.teacherId, activeSlot: input.teacherId },
        select: { id: true },
      });
      if (active) return null;
      return this.createOne(tx, {
        actorId: null,
        teacherId: input.teacherId,
        campusId: input.campusId,
        mentorId: null,
        plan,
        selectedCourses: safetyCourses,
        type: TrainingAssignmentType.safety_retraining,
        assignedAt: new Date(),
        dueAt: input.dueAt,
        sourceAssignmentId: input.sourceAssignmentId,
        alreadyLocked: true,
        reason: "安全培训进入到期复训窗口，系统自动布置",
      });
    });
  }

  private async createOne(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string | null;
      teacherId: string;
      campusId: string;
      mentorId: string | null;
      plan: Awaited<ReturnType<TrainingAssignmentService["requireOnboardingPlan"]>>;
      selectedCourses: Awaited<
        ReturnType<TrainingAssignmentService["requireOnboardingPlan"]>
      >["courses"];
      type: TrainingAssignmentType;
      assignedAt: Date;
      dueAt: Date;
      sourceAssignmentId: string | null;
      alreadyLocked?: boolean;
      reason: string;
    },
  ) {
    if (!input.alreadyLocked) await this.lockTeacher(tx, input.teacherId);
    const active = await tx.trainingAssignment.findFirst({
      where: { teacherId: input.teacherId, activeSlot: input.teacherId },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException("同一教师同一时间只能有一个有效培训任务");
    }
    const latest = await tx.trainingAssignment.aggregate({
      where: { teacherId: input.teacherId },
      _max: { roundNumber: true },
    });
    const assignment = await tx.trainingAssignment.create({
      data: {
        teacherId: input.teacherId,
        campusId: input.campusId,
        mentorId: input.mentorId,
        planId: input.plan.id,
        type: input.type,
        roundNumber: (latest._max.roundNumber ?? 0) + 1,
        status: TrainingAssignmentStatus.pending,
        activeSlot: input.teacherId,
        assignedById: input.actorId,
        sourceAssignmentId: input.sourceAssignmentId,
        assignedAt: input.assignedAt,
        dueAt: input.dueAt,
      },
    });
    for (const [index, link] of input.selectedCourses.entries()) {
      const snapshot = await this.courses.createSnapshot(tx, link.courseId);
      await tx.trainingAssignmentCourse.create({
        data: {
          assignmentId: assignment.id,
          originalCourseId: link.courseId,
          snapshotId: snapshot.id,
          sortOrder: index + 1,
          status:
            index === 0
              ? TrainingCourseStatus.available
              : TrainingCourseStatus.locked,
          unlockedAt: index === 0 ? input.assignedAt : null,
          attempts: {
            create: {
              attemptNumber: 1,
              status: TrainingAttemptStatus.available,
            },
          },
        },
      });
    }
    await tx.trainingNotification.create({
      data: {
        userId: input.teacherId,
        type: TrainingNotificationType.assignment_created,
        title:
          input.type === TrainingAssignmentType.safety_retraining
            ? "安全复训任务已生成"
            : "新教师培训任务已布置",
        content: `请在 ${input.dueAt.toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        })} 前完成培训。`,
        assignmentId: assignment.id,
        dedupeKey: `assignment-created:${assignment.id}`,
      },
    });
    await this.audit.log(
      {
        actorId: input.actorId,
        campusId: input.campusId,
        assignmentId: assignment.id,
        action: "assignment.create",
        targetType: "TrainingAssignment",
        targetId: assignment.id,
        after: {
          teacherId: input.teacherId,
          mentorId: input.mentorId,
          type: input.type,
          roundNumber: assignment.roundNumber,
          dueAt: input.dueAt.toISOString(),
          courseCount: input.selectedCourses.length,
        },
        reason: input.reason,
      },
      tx,
    );
    return tx.trainingAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: assignmentListInclude,
    });
  }

  private async terminateInTransaction(
    tx: Prisma.TransactionClient,
    assignment: {
      id: string;
      teacherId: string;
      campusId: string;
      status: TrainingAssignmentStatus;
    },
    actorId: string | null,
    reason: string,
  ) {
    const now = new Date();
    await tx.trainingStudySession.updateMany({
      where: {
        courseAttempt: {
          assignmentCourse: { assignmentId: assignment.id },
        },
        isActive: true,
      },
      data: { isActive: false, endedAt: now },
    });
    const result = await tx.trainingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: TrainingAssignmentStatus.terminated,
        activeSlot: null,
        terminatedAt: now,
        terminationReason: reason,
      },
    });
    await tx.trainingNotification.create({
      data: {
        userId: assignment.teacherId,
        type: TrainingNotificationType.assignment_terminated,
        title: "培训任务已终止",
        content: reason,
        assignmentId: assignment.id,
        dedupeKey: `assignment-terminated:${assignment.id}`,
      },
    });
    await this.audit.log(
      {
        actorId,
        campusId: assignment.campusId,
        assignmentId: assignment.id,
        action: "assignment.terminate",
        targetType: "TrainingAssignment",
        targetId: assignment.id,
        before: { status: assignment.status },
        after: { status: TrainingAssignmentStatus.terminated },
        reason,
      },
      tx,
    );
    return result;
  }

  private async requireManageable(actorId: string, assignmentId: string) {
    const assignment = await this.prisma.trainingAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException("培训任务不存在");
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      assignment.campusId,
    );
    return assignment;
  }

  private async requireAssignmentCourse(assignmentCourseId: string) {
    const course = await this.prisma.trainingAssignmentCourse.findUnique({
      where: { id: assignmentCourseId },
      include: {
        assignment: true,
        snapshot: true,
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
      },
    });
    if (!course) throw new NotFoundException("培训课程任务不存在");
    return course;
  }

  private async requireOnboardingPlan(
    client: Pick<PrismaService, "trainingPlanTemplate"> = this.prisma,
  ) {
    const plan = await client.trainingPlanTemplate.findUnique({
      where: { code: "new_teacher_onboarding" },
      include: {
        courses: {
          orderBy: { sortOrder: "asc" },
          include: { course: true },
        },
      },
    });
    if (!plan?.isActive) {
      throw new ConflictException("固定新教师培训计划尚未配置或未启用");
    }
    const valid = onboardingCourseRules.every(
      ([code, practical, safety], index) => {
        const link = plan.courses[index];
        return (
          link?.course.code === code &&
          link.course.isRequired &&
          link.course.requiresPractical === practical &&
          link.course.isSafety === safety
        );
      },
    );
    if (plan.courses.length !== onboardingCourseRules.length || !valid) {
      throw new ConflictException(
        "固定新教师培训计划的7门课程、顺序或完成规则不符合MVP基线",
      );
    }
    return plan;
  }

  private async assertAssignmentActors(
    teacherIds: string[],
    mentorId: string,
    campusId: string,
    actorId: string,
  ) {
    const actorHasGlobal = await this.access.hasGlobalPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set([...teacherIds, mentorId])] } },
      select: {
        id: true,
        role: true,
        status: true,
        employmentStatus: true,
        teachingClasses: {
          where: { campusId },
          take: 1,
          select: { id: true },
        },
        trainingAssignments: {
          where: { campusId },
          take: 1,
          select: { id: true },
        },
      },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    for (const teacherId of teacherIds) {
      const teacher = byId.get(teacherId);
      if (
        !teacher ||
        teacher.role !== UserRole.teacher ||
        teacher.status !== UserStatus.active ||
        teacher.employmentStatus !== TeacherEmploymentStatus.employed
      ) {
        throw new BadRequestException("只能给在职且已启用的教师布置培训");
      }
      if (
        !actorHasGlobal &&
        teacher.teachingClasses.length === 0 &&
        teacher.trainingAssignments.length === 0
      ) {
        throw new BadRequestException("参训教师不属于所选校区");
      }
    }
    const mentor = byId.get(mentorId);
    if (
      !mentor ||
      mentor.status !== UserStatus.active ||
      !mentorRoles.includes(mentor.role)
    ) {
      throw new BadRequestException("带教负责人不存在或账号已停用");
    }
    if (!actorHasGlobal) {
      const mentorAuthorized =
        mentor.role === UserRole.teacher
          ? mentor.teachingClasses.length > 0 ||
            mentor.trainingAssignments.length > 0
          : Boolean(
              await this.prisma.trainingPermissionGrant.findFirst({
                where: {
                  userId: mentorId,
                  permission: {
                    in: [
                      TrainingPermission.training_manage,
                      TrainingPermission.practical_confirm,
                    ],
                  },
                  isActive: true,
                  scopeKey: { in: ["GLOBAL", campusId] },
                },
                select: { id: true },
              }),
            );
      if (!mentorAuthorized) {
        throw new BadRequestException("带教负责人不属于所选校区或未获该校区授权");
      }
    }
  }

  private async authorizedCampusFilter(actorId: string, campusId?: string) {
    if (campusId) {
      await this.access.assertPermission(
        actorId,
        TrainingPermission.training_manage,
        campusId,
      );
      return campusId;
    }
    const scope = await this.access.campusScope(
      actorId,
      TrainingPermission.training_manage,
    );
    if (scope === null) return undefined;
    if (scope.length === 0) throw new ForbiddenException("没有培训管理权限");
    return { in: scope };
  }

  private deadlineWhere(value: string | undefined, now: Date) {
    if (!value) return undefined;
    if (value === "overdue") return { lt: now };
    if (value === "due_soon") {
      return { gte: now, lte: addNaturalDays(now, 3) };
    }
    if (value === "normal") return { gt: addNaturalDays(now, 3) };
    throw new BadRequestException("期限状态无效");
  }

  private progress(courses: Array<{ status: TrainingCourseStatus }>) {
    const completedStatuses: TrainingCourseStatus[] = [
      TrainingCourseStatus.completed,
      TrainingCourseStatus.exempted,
      TrainingCourseStatus.awaiting_safety,
    ];
    const completed = courses.filter((course) =>
      completedStatuses.includes(course.status),
    ).length;
    return {
      completed,
      total: courses.length,
      percent: courses.length ? Math.round((completed / courses.length) * 100) : 0,
    };
  }

  private lockTeacher(tx: Prisma.TransactionClient, teacherId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${teacherId}`}))`;
  }
}
