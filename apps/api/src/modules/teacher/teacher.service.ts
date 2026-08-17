import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GrowthRecordType,
  HomeworkStatus,
  LessonPlanStatus,
  Prisma,
  ResearchActivityStatus,
  ResearchActivityType,
  ResearchParticipationStatus,
  StudentStatus,
  UserStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { assertOwnedFileAssetUrls } from "../files/file-asset-policy";
import { prepareMessageInput } from "../messages/message-input";
import { PrismaService } from "../prisma/prisma.service";
import { CheckWorkflowStepDto } from "./dto/check-workflow-step.dto";
import { CreateGrowthFeedbackDto } from "./dto/create-growth-feedback.dto";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { CreateLessonPlanDto } from "./dto/create-lesson-plan.dto";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { CreateResearchActivityDto } from "./dto/create-research-activity.dto";
import { CreateTeachingRecordDto } from "./dto/create-teaching-record.dto";
import { SendTeacherMessageDto } from "./dto/send-teacher-message.dto";
import { UpdateHomeworkSubmissionDto } from "./dto/update-homework-submission.dto";
import { UpdateLessonPlanDto } from "./dto/update-lesson-plan.dto";
import { UpdateLessonPlanStatusDto } from "./dto/update-lesson-plan-status.dto";
import { UpdateResearchActivityDto } from "./dto/update-research-activity.dto";
import { UpdateResearchParticipationDto } from "./dto/update-research-participation.dto";

const RESEARCH_ACTIVITY_INCLUDE = Prisma.validator<Prisma.ResearchActivityInclude>()({
  organizer: { select: { id: true, name: true } },
  campus: { select: { id: true, name: true } },
  participants: {
    orderBy: { joinedAt: "asc" },
    include: { teacher: { select: { id: true, name: true } } },
  },
});

type ResearchActivityWithRelations = Prisma.ResearchActivityGetPayload<{
  include: typeof RESEARCH_ACTIVITY_INCLUDE;
}>;

@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async dashboard(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: {
        id: true,
        name: true,
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const today = this.today();
    const sessions = await this.prisma.workflowSession.findMany({
      where: {
        teacherId,
        date: today,
      },
      select: {
        id: true,
        classId: true,
        status: true,
        steps: {
          select: {
            checked: true,
          },
        },
      },
    });

    const homeworkPending = await this.prisma.homeworkSubmission.count({
      where: {
        status: { in: [HomeworkStatus.submitted, HomeworkStatus.overdue] },
        homework: { teacherId },
      },
    });

    return {
      data: {
        date: today.toISOString(),
        classCount: classes.length,
        studentCount: classes.reduce(
          (sum, item) => sum + item._count.students,
          0,
        ),
        workflow: {
          sessionCount: sessions.length,
          uncheckedStepCount: sessions.reduce(
            (sum, session) =>
              sum + session.steps.filter((step) => !step.checked).length,
            0,
          ),
        },
        homeworkPending,
        classes,
      },
    };
  }

  async classes(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "asc" },
      select: this.classSelect(),
    });

    return { data: classes };
  }

  async classStudents(teacherId: string, classId: string) {
    await this.assertTeacherClass(teacherId, classId);

    const students = await this.prisma.student.findMany({
      where: { classId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        gender: true,
        birthday: true,
        status: true,
      },
    });

    return { data: students };
  }

  async workflowToday(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (!classes.length) {
      return { data: [] };
    }

    const template = await this.prisma.workflowTemplate.findFirst({
      where: { isActive: true },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!template) {
      throw new NotFoundException("Active workflow template not found");
    }

    const today = this.today();
    const sessions = [];
    for (const klass of classes) {
      const session = await this.prisma.workflowSession.upsert({
        where: {
          classId_date: {
            classId: klass.id,
            date: today,
          },
        },
        update: {
          teacherId,
        },
        create: {
          classId: klass.id,
          teacherId,
          templateId: template.id,
          date: today,
          steps: {
            create: template.steps.map((step) => ({
              stepKey: step.stepKey,
              name: step.name,
              timeRange: step.timeRange,
              sortOrder: step.sortOrder,
              requirePhoto: step.requirePhoto,
            })),
          },
        },
        select: this.workflowSessionSelect(),
      });
      sessions.push(session);
    }

    return { data: sessions };
  }

  async checkWorkflowStep(
    teacherId: string,
    sessionId: string,
    stepId: string,
    dto: CheckWorkflowStepDto,
  ) {
    const session = await this.prisma.workflowSession.findUnique({
      where: { id: sessionId },
      include: {
        class: { select: { id: true, name: true, teacherId: true } },
        steps: {
          where: { id: stepId },
          select: {
            id: true,
            name: true,
            requirePhoto: true,
            checked: true,
          },
        },
      },
    });

    if (!session || session.steps.length === 0) {
      throw new NotFoundException("Workflow step not found");
    }

    if (session.class.teacherId !== teacherId) {
      throw new ForbiddenException(
        "Cannot check workflow for another teacher class",
      );
    }

    const step = session.steps[0];
    const photoUrls = Array.from(new Set(dto.photoUrls ?? []));
    if (step.checked) {
      throw new ConflictException("该流程环节已经完成，请勿重复打卡");
    }
    if (step.requirePhoto && photoUrls.length === 0) {
      throw new BadRequestException("该流程环节需要先上传照片凭证");
    }

    await assertOwnedFileAssetUrls(this.prisma, {
      ownerId: teacherId,
      scene: "workflow",
      urls: photoUrls,
      imageOnly: true,
      invalidMessage: "流程图片无效、不属于当前教师或文件场景不是 workflow",
    });

    const checkedAt = new Date();
    const updateResult = await this.prisma.workflowStep.updateMany({
      where: { id: stepId, checked: false },
      data: {
        checked: true,
        checkedAt,
        teacherId,
        photoUrls,
      },
    });
    if (updateResult.count === 0) {
      throw new ConflictException("该流程环节已经完成，请勿重复打卡");
    }

    const updatedStep = await this.prisma.workflowStep.findUniqueOrThrow({
      where: { id: stepId },
      select: {
        id: true,
        stepKey: true,
        name: true,
        timeRange: true,
        sortOrder: true,
        requirePhoto: true,
        checked: true,
        checkedAt: true,
        photoUrls: true,
      },
    });

    if (!step.checked) {
      const students = await this.prisma.student.findMany({
        where: { classId: session.classId },
        select: { id: true, name: true },
      });

      if (students.length) {
        await this.prisma.growthRecord.createMany({
          data: students.map((student) => ({
            studentId: student.id,
            teacherId,
            type: GrowthRecordType.workflow,
            title: `${step.name}已完成`,
            content: `${session.class.name} ${student.name} 的${step.name}已由老师确认。`,
            happenedAt: checkedAt,
          })),
        });
      }
    }

    await this.audit.log({
      userId: teacherId,
      action: "teacher.workflowStep.check",
      targetType: "WorkflowStep",
      targetId: updatedStep.id,
      detail: {
        sessionId,
        photoCount: updatedStep.photoUrls.length,
      },
    });

    return { data: updatedStep };
  }

  async teachingRecords(teacherId: string) {
    const records = await this.prisma.teachingRecord.findMany({
      where: { teacherId },
      orderBy: { date: "desc" },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    return { data: records };
  }

  async createTeachingRecord(teacherId: string, dto: CreateTeachingRecordDto) {
    await this.assertTeacherClass(teacherId, dto.classId);

    const record = await this.prisma.teachingRecord.create({
      data: {
        teacherId,
        classId: dto.classId,
        date: new Date(dto.date),
        course: dto.course,
        content: dto.content,
        tags: dto.tags ?? [],
      },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.teachingRecord.create",
      targetType: "TeachingRecord",
      targetId: record.id,
      detail: {
        classId: dto.classId,
        course: dto.course,
      },
    });

    return { data: record };
  }

  async growthFeedbacks(teacherId: string) {
    const records = await this.prisma.growthRecord.findMany({
      where: {
        teacherId,
        type: GrowthRecordType.teacher_feedback,
      },
      orderBy: [{ happenedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return { data: records };
  }

  async lessonPlans(teacherId: string, scope = "week") {
    const where: Prisma.LessonPlanWhereInput = { teacherId };
    if (scope === "draft") {
      where.status = LessonPlanStatus.draft;
    } else if (scope === "week") {
      const start = this.startOfWeek();
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      where.lessonDate = { gte: start, lt: end };
    } else if (scope !== "all") {
      throw new BadRequestException("Unsupported lesson plan scope");
    }

    const lessonPlans = await this.prisma.lessonPlan.findMany({
      where,
      orderBy: [{ lessonDate: "asc" }, { createdAt: "desc" }],
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    return { data: lessonPlans };
  }

  async createLessonPlan(teacherId: string, dto: CreateLessonPlanDto) {
    await this.assertTeacherClass(teacherId, dto.classId);
    const lessonPlan = await this.prisma.lessonPlan.create({
      data: {
        teacherId,
        classId: dto.classId,
        theme: dto.theme.trim(),
        lessonDate: new Date(dto.lessonDate),
        durationMinutes: dto.durationMinutes,
        objectives: dto.objectives.trim(),
        content: dto.content.trim(),
        status: dto.status ?? LessonPlanStatus.draft,
      },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.lessonPlan.create",
      targetType: "LessonPlan",
      targetId: lessonPlan.id,
      detail: {
        classId: lessonPlan.classId,
        lessonDate: lessonPlan.lessonDate.toISOString(),
        status: lessonPlan.status,
      },
    });

    return { data: lessonPlan };
  }

  async updateLessonPlan(
    teacherId: string,
    lessonPlanId: string,
    dto: UpdateLessonPlanDto,
  ) {
    const existing = await this.assertOwnedLessonPlan(teacherId, lessonPlanId);
    if (dto.classId && dto.classId !== existing.classId) {
      await this.assertTeacherClass(teacherId, dto.classId);
    }

    const lessonPlan = await this.prisma.lessonPlan.update({
      where: { id: lessonPlanId },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme.trim() } : {}),
        ...(dto.lessonDate !== undefined
          ? { lessonDate: new Date(dto.lessonDate) }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? { durationMinutes: dto.durationMinutes }
          : {}),
        ...(dto.objectives !== undefined
          ? { objectives: dto.objectives.trim() }
          : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.lessonPlan.update",
      targetType: "LessonPlan",
      targetId: lessonPlan.id,
      detail: {
        classId: lessonPlan.classId,
        status: lessonPlan.status,
      },
    });

    return { data: lessonPlan };
  }

  async updateLessonPlanStatus(
    teacherId: string,
    lessonPlanId: string,
    dto: UpdateLessonPlanStatusDto,
  ) {
    await this.assertOwnedLessonPlan(teacherId, lessonPlanId);
    const lessonPlan = await this.prisma.lessonPlan.update({
      where: { id: lessonPlanId },
      data: { status: dto.status },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.lessonPlan.status",
      targetType: "LessonPlan",
      targetId: lessonPlan.id,
      detail: { status: lessonPlan.status },
    });

    return { data: lessonPlan };
  }

  async researchActivities(
    teacherId: string,
    type?: string,
    scope = "upcoming",
  ) {
    const campusIds = await this.teacherCampusIds(teacherId);
    const where: Prisma.ResearchActivityWhereInput = {
      campusId: { in: campusIds },
      AND: [
        {
          OR: [
            { status: { not: ResearchActivityStatus.draft } },
            { organizerId: teacherId },
          ],
        },
      ],
    };

    if (type && type !== "all") {
      if (!Object.values(ResearchActivityType).includes(type as ResearchActivityType)) {
        throw new BadRequestException("Unsupported research activity type");
      }
      where.type = type as ResearchActivityType;
    }

    if (scope === "upcoming") {
      where.endAt = { gte: new Date() };
      where.status = { in: [ResearchActivityStatus.open, ResearchActivityStatus.draft] };
    } else if (scope === "mine") {
      where.OR = [
        { organizerId: teacherId },
        {
          participants: {
            some: {
              teacherId,
              status: { not: ResearchParticipationStatus.cancelled },
            },
          },
        },
      ];
    } else if (scope !== "all") {
      throw new BadRequestException("Unsupported research activity scope");
    }

    const activities = await this.prisma.researchActivity.findMany({
      where,
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      include: RESEARCH_ACTIVITY_INCLUDE,
    });

    return {
      data: activities.map((activity) =>
        this.researchActivityView(activity, teacherId),
      ),
    };
  }

  async createResearchActivity(
    teacherId: string,
    dto: CreateResearchActivityDto,
  ) {
    await this.assertTeacherCampus(teacherId, dto.campusId);
    const { startAt, endAt } = this.researchActivityDates(dto.startAt, dto.endAt);
    const activity = await this.prisma.researchActivity.create({
      data: {
        organizerId: teacherId,
        campusId: dto.campusId,
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description.trim(),
        startAt,
        endAt,
        location: dto.location.trim(),
        status: dto.status ?? ResearchActivityStatus.draft,
        participants: {
          create: {
            teacherId,
            status: ResearchParticipationStatus.registered,
          },
        },
      },
      include: RESEARCH_ACTIVITY_INCLUDE,
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.researchActivity.create",
      targetType: "ResearchActivity",
      targetId: activity.id,
      detail: {
        campusId: activity.campusId,
        type: activity.type,
        status: activity.status,
      },
    });

    return { data: this.researchActivityView(activity, teacherId) };
  }

  async updateResearchActivity(
    teacherId: string,
    activityId: string,
    dto: UpdateResearchActivityDto,
  ) {
    const existing = await this.assertOwnedResearchActivity(
      teacherId,
      activityId,
    );
    let dates: { startAt: Date; endAt: Date } | undefined;
    if (dto.startAt !== undefined || dto.endAt !== undefined) {
      dates = this.researchActivityDates(
        dto.startAt ?? existing.startAt.toISOString(),
        dto.endAt ?? existing.endAt.toISOString(),
      );
    }

    const activity = await this.prisma.researchActivity.update({
      where: { id: activityId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dates ?? {}),
        ...(dto.location !== undefined
          ? { location: dto.location.trim() }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: RESEARCH_ACTIVITY_INCLUDE,
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.researchActivity.update",
      targetType: "ResearchActivity",
      targetId: activity.id,
      detail: { type: activity.type, status: activity.status },
    });

    return { data: this.researchActivityView(activity, teacherId) };
  }

  async updateResearchParticipation(
    teacherId: string,
    activityId: string,
    dto: UpdateResearchParticipationDto,
  ) {
    const activity = await this.assertVisibleResearchActivity(
      teacherId,
      activityId,
    );
    if (activity.status !== ResearchActivityStatus.open) {
      throw new ConflictException("当前活动未开放参与操作");
    }
    if (dto.status === ResearchParticipationStatus.attended) {
      throw new ForbiddenException("活动出席状态需由活动组织者确认");
    }

    await this.prisma.researchParticipant.upsert({
      where: { activityId_teacherId: { activityId, teacherId } },
      update: { status: dto.status },
      create: { activityId, teacherId, status: dto.status },
    });

    const updated = await this.prisma.researchActivity.findUniqueOrThrow({
      where: { id: activityId },
      include: RESEARCH_ACTIVITY_INCLUDE,
    });
    await this.audit.log({
      userId: teacherId,
      action: "teacher.researchActivity.participation",
      targetType: "ResearchActivity",
      targetId: activityId,
      detail: { status: dto.status },
    });

    return { data: this.researchActivityView(updated, teacherId) };
  }

  async createGrowthFeedback(
    teacherId: string,
    studentId: string,
    dto: CreateGrowthFeedbackDto,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        classId: true,
      },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    await this.assertTeacherClass(teacherId, student.classId);

    const record = await this.prisma.growthRecord.create({
      data: {
        studentId,
        teacherId,
        type: GrowthRecordType.teacher_feedback,
        title: dto.title,
        content: dto.content,
        visibleToParent: dto.visibleToParent ?? true,
        happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : new Date(),
      },
    });

    await this.audit.log({
      userId: teacherId,
      action: "teacher.growthRecord.create",
      targetType: "GrowthRecord",
      targetId: record.id,
      detail: {
        studentId,
        visibleToParent: record.visibleToParent,
      },
    });

    return { data: record };
  }

  async homework(teacherId: string) {
    const homework = await this.prisma.homeworkAssignment.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: {
        class: { select: { id: true, name: true } },
        submissions: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { student: { createdAt: "asc" } },
        },
      },
    });

    return { data: homework };
  }

  async createHomework(teacherId: string, dto: CreateHomeworkDto) {
    await this.assertTeacherClass(teacherId, dto.classId);

    const title = dto.title.trim();
    const subject = dto.subject.trim();
    const content = dto.content.trim();
    if (!title || !subject || !content) {
      throw new BadRequestException(
        "Homework title, subject and content are required",
      );
    }

    const students = await this.prisma.student.findMany({
      where: {
        classId: dto.classId,
        status: StudentStatus.active,
      },
      select: { id: true },
    });

    if (students.length === 0) {
      throw new BadRequestException("No active students in this class");
    }

    const homework = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.homeworkAssignment.create({
        data: {
          classId: dto.classId,
          teacherId,
          title,
          subject,
          content,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          submissions: {
            create: students.map((student) => ({
              studentId: student.id,
            })),
          },
        },
        include: {
          class: { select: { id: true, name: true } },
          submissions: true,
        },
      });

      await this.audit.log(
        {
          userId: teacherId,
          action: "teacher.homework.create",
          targetType: "HomeworkAssignment",
          targetId: created.id,
          detail: {
            classId: dto.classId,
            submissionCount: created.submissions.length,
          },
        },
        transaction,
      );

      return created;
    });

    return { data: homework };
  }

  async notices(teacherId: string) {
    const notices = await this.prisma.notice.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: {
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        receipts: {
          select: {
            viewedAt: true,
            confirmedAt: true,
          },
        },
      },
    });

    return {
      data: notices.map(({ receipts, ...notice }) => ({
        ...notice,
        receiptSummary: this.noticeReceiptSummary(receipts),
      })),
    };
  }

  async createNotice(teacherId: string, dto: CreateNoticeDto) {
    await this.assertTeacherClass(teacherId, dto.classId);

    const title = dto.title.trim();
    const content = dto.content.trim();
    if (!title || !content) {
      throw new BadRequestException("Notice title and content are required");
    }

    const students = await this.prisma.student.findMany({
      where: {
        classId: dto.classId,
        status: StudentStatus.active,
      },
      select: {
        id: true,
        guardians: {
          where: {
            status: "active",
            canReceiveNotice: true,
            parent: {
              status: UserStatus.active,
            },
          },
          select: {
            parentId: true,
          },
        },
      },
    });

    const recipients = students.flatMap((student) =>
      student.guardians.map((guardian) => ({
        studentId: student.id,
        parentId: guardian.parentId,
      })),
    );
    const unboundStudentCount = students.filter(
      (student) => student.guardians.length === 0,
    ).length;

    if (recipients.length === 0) {
      throw new BadRequestException(
        "No active guardians available for this class",
      );
    }

    const notice = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.notice.create({
        data: {
          classId: dto.classId,
          teacherId,
          kind: dto.kind,
          title,
          content,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          unboundStudentCount,
          receipts: {
            create: recipients,
          },
        },
        include: {
          class: {
            select: {
              id: true,
              name: true,
            },
          },
          receipts: {
            select: {
              viewedAt: true,
              confirmedAt: true,
            },
          },
        },
      });

      await this.audit.log(
        {
          userId: teacherId,
          action: "teacher.notice.publish",
          targetType: "Notice",
          targetId: created.id,
          detail: {
            classId: dto.classId,
            kind: dto.kind,
            recipientCount: recipients.length,
            unboundStudentCount,
          },
        },
        transaction,
      );

      return created;
    });

    const { receipts, ...noticeData } = notice;
    return {
      data: {
        ...noticeData,
        receiptSummary: this.noticeReceiptSummary(receipts),
      },
    };
  }

  async noticeReceipts(teacherId: string, noticeId: string) {
    const notice = await this.prisma.notice.findFirst({
      where: {
        id: noticeId,
        teacherId,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        receipts: {
          orderBy: [{ student: { name: "asc" } }, { createdAt: "asc" }],
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
            parent: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!notice) {
      throw new NotFoundException("Notice not found");
    }

    const summary = this.noticeReceiptSummary(notice.receipts);
    return {
      data: {
        notice: {
          id: notice.id,
          kind: notice.kind,
          title: notice.title,
          content: notice.content,
          dueAt: notice.dueAt,
          createdAt: notice.createdAt,
          unboundStudentCount: notice.unboundStudentCount,
          class: notice.class,
        },
        summary,
        receipts: notice.receipts.map((receipt) => ({
          id: receipt.id,
          student: receipt.student,
          parent: receipt.parent,
          status: receipt.confirmedAt
            ? "confirmed"
            : receipt.viewedAt
              ? "viewed"
              : "pending",
          viewedAt: receipt.viewedAt,
          confirmedAt: receipt.confirmedAt,
        })),
      },
    };
  }

  async updateHomeworkSubmission(
    teacherId: string,
    submissionId: string,
    dto: UpdateHomeworkSubmissionDto,
  ) {
    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: {
        homework: {
          select: {
            id: true,
            teacherId: true,
            title: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException("Homework submission not found");
    }

    if (submission.homework.teacherId !== teacherId) {
      throw new ForbiddenException("Cannot update another teacher homework");
    }

    if (dto.status !== HomeworkStatus.reviewed) {
      throw new BadRequestException(
        "Teacher can only mark homework as reviewed",
      );
    }

    if (submission.status !== HomeworkStatus.submitted) {
      throw new BadRequestException(
        submission.status === HomeworkStatus.reviewed
          ? "Homework has already been reviewed"
          : "Homework has not been submitted",
      );
    }

    const reviewedAt = new Date();
    const remark = dto.remark?.trim() || null;
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.homeworkSubmission.updateMany({
        where: {
          id: submissionId,
          status: HomeworkStatus.submitted,
        },
        data: {
          status: HomeworkStatus.reviewed,
          reviewedAt,
          remark,
        },
      });

      if (result.count === 0) {
        throw new BadRequestException("Homework status has changed");
      }

      await transaction.growthRecord.create({
        data: {
          studentId: submission.studentId,
          teacherId,
          type: GrowthRecordType.homework,
          title: `${submission.homework.title}已批改`,
          content: remark
            ? `${submission.student.name}的作业已批改：${remark}`
            : `${submission.student.name}的作业已完成批改。`,
          happenedAt: reviewedAt,
        },
      });

      await this.audit.log(
        {
          userId: teacherId,
          action: "teacher.homeworkSubmission.review",
          targetType: "HomeworkSubmission",
          targetId: submission.id,
          detail: {
            homeworkId: submission.homework.id,
            studentId: submission.studentId,
            hasRemark: Boolean(remark),
          },
        },
        transaction,
      );

      return transaction.homeworkSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: {
          homework: { select: { id: true, title: true } },
          student: { select: { id: true, name: true } },
        },
      });
    });

    return { data: updated };
  }

  async conversations(teacherId: string) {
    await this.ensureTeacherConversations(teacherId);

    const activeBindings = await this.prisma.studentGuardian.findMany({
      where: {
        status: "active",
        student: { class: { teacherId } },
      },
      select: { studentId: true, parentId: true },
    });

    if (!activeBindings.length) {
      return { data: [] };
    }

    const conversations = await this.prisma.conversation.findMany({
      where: {
        teacherId,
        OR: activeBindings.map((binding) => ({
          studentId: binding.studentId,
          parentId: binding.parentId,
        })),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            class: { select: { id: true, name: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const parentIds = Array.from(
      new Set(conversations.map((item) => item.parentId)),
    );
    const parents = await this.prisma.user.findMany({
      where: { id: { in: parentIds } },
      select: { id: true, name: true, phone: true },
    });
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));

    const data = await Promise.all(
      conversations.map(async (conversation) => ({
        ...conversation,
        parent: parentById.get(conversation.parentId) ?? null,
        unreadCount: await this.unreadCount(conversation.id, teacherId),
      })),
    );

    return { data };
  }

  async conversationMessages(teacherId: string, conversationId: string) {
    await this.assertTeacherConversation(teacherId, conversationId);

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: teacherId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    return { data: messages };
  }

  async sendMessage(
    teacherId: string,
    conversationId: string,
    dto: SendTeacherMessageDto,
  ) {
    await this.assertTeacherConversation(teacherId, conversationId);

    const input = await prepareMessageInput(this.prisma, teacherId, dto);

    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          conversationId,
          senderId: teacherId,
          ...input,
        },
      });

      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: created.createdAt },
      });

      return created;
    });

    return { data: message };
  }

  private async assertOwnedLessonPlan(
    teacherId: string,
    lessonPlanId: string,
  ) {
    const lessonPlan = await this.prisma.lessonPlan.findFirst({
      where: { id: lessonPlanId, teacherId },
      select: { id: true, classId: true },
    });

    if (!lessonPlan) {
      throw new NotFoundException("Lesson plan not found");
    }

    return lessonPlan;
  }

  private async teacherCampusIds(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: { campusId: true },
      distinct: ["campusId"],
    });
    return classes.map((item) => item.campusId);
  }

  private async assertTeacherCampus(teacherId: string, campusId: string) {
    const klass = await this.prisma.class.findFirst({
      where: { teacherId, campusId },
      select: { id: true },
    });
    if (!klass) {
      throw new ForbiddenException("Cannot manage another campus activity");
    }
  }

  private async assertOwnedResearchActivity(
    teacherId: string,
    activityId: string,
  ) {
    const activity = await this.prisma.researchActivity.findFirst({
      where: { id: activityId, organizerId: teacherId },
      select: { id: true, startAt: true, endAt: true },
    });
    if (!activity) {
      throw new NotFoundException("Research activity not found");
    }
    return activity;
  }

  private async assertVisibleResearchActivity(
    teacherId: string,
    activityId: string,
  ) {
    const campusIds = await this.teacherCampusIds(teacherId);
    const activity = await this.prisma.researchActivity.findFirst({
      where: { id: activityId, campusId: { in: campusIds } },
      select: { id: true, status: true },
    });
    if (!activity) {
      throw new NotFoundException("Research activity not found");
    }
    return activity;
  }

  private researchActivityDates(startValue: string, endValue: string) {
    const startAt = new Date(startValue);
    const endAt = new Date(endValue);
    if (endAt <= startAt) {
      throw new BadRequestException("活动结束时间必须晚于开始时间");
    }
    return { startAt, endAt };
  }

  private researchActivityView(
    activity: ResearchActivityWithRelations,
    teacherId: string,
  ) {
    const participation = activity.participants.find(
      (item) => item.teacherId === teacherId,
    );
    return {
      ...activity,
      isOrganizer: activity.organizerId === teacherId,
      myParticipationStatus: participation?.status ?? null,
      participantCount: activity.participants.filter(
        (item) => item.status !== ResearchParticipationStatus.cancelled,
      ).length,
    };
  }

  private startOfWeek() {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
    return start;
  }

  private async ensureTeacherConversations(teacherId: string) {
    const guardians = await this.prisma.studentGuardian.findMany({
      where: {
        status: "active",
        student: {
          class: {
            teacherId,
          },
        },
      },
      select: {
        studentId: true,
        parentId: true,
        student: {
          select: {
            class: {
              select: {
                teacherId: true,
              },
            },
          },
        },
      },
    });

    for (const guardian of guardians) {
      const classTeacherId = guardian.student.class.teacherId;
      if (!classTeacherId) continue;

      await this.prisma.conversation.upsert({
        where: {
          studentId_parentId_teacherId: {
            studentId: guardian.studentId,
            parentId: guardian.parentId,
            teacherId: classTeacherId,
          },
        },
        update: {},
        create: {
          studentId: guardian.studentId,
          parentId: guardian.parentId,
          teacherId: classTeacherId,
        },
      });
    }
  }

  private async assertTeacherClass(teacherId: string, classId: string) {
    const klass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        teacherId,
      },
      select: { id: true },
    });

    if (!klass) {
      throw new ForbiddenException("Cannot access another teacher class");
    }
  }

  private async assertTeacherConversation(
    teacherId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        teacherId,
      },
      select: { id: true, studentId: true, parentId: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const activeBinding = await this.prisma.studentGuardian.findFirst({
      where: {
        studentId: conversation.studentId,
        parentId: conversation.parentId,
        status: "active",
      },
      select: { id: true },
    });

    if (!activeBinding) {
      throw new NotFoundException("Conversation not found");
    }
  }

  private async unreadCount(conversationId: string, userId: string) {
    return this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
    });
  }

  private noticeReceiptSummary(
    receipts: Array<{
      viewedAt: Date | null;
      confirmedAt: Date | null;
    }>,
  ) {
    const totalCount = receipts.length;
    const viewedCount = receipts.filter((receipt) => receipt.viewedAt).length;
    const confirmedCount = receipts.filter(
      (receipt) => receipt.confirmedAt,
    ).length;

    return {
      totalCount,
      viewedCount,
      confirmedCount,
      pendingCount: totalCount - confirmedCount,
    };
  }

  private today() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private classSelect() {
    return {
      id: true,
      campusId: true,
      name: true,
      teacherId: true,
      createdAt: true,
      updatedAt: true,
      campus: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          students: true,
        },
      },
    } satisfies Prisma.ClassSelect;
  }

  private workflowSessionSelect() {
    return {
      id: true,
      classId: true,
      teacherId: true,
      templateId: true,
      date: true,
      status: true,
      class: {
        select: {
          id: true,
          name: true,
        },
      },
      steps: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          stepKey: true,
          name: true,
          timeRange: true,
          sortOrder: true,
          requirePhoto: true,
          checked: true,
          checkedAt: true,
          photoUrls: true,
        },
      },
    } satisfies Prisma.WorkflowSessionSelect;
  }
}
