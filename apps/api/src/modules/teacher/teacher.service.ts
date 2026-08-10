import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GrowthRecordType,
  HomeworkStatus,
  MessageKind,
  Prisma,
  StudentStatus,
  UserStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CheckWorkflowStepDto } from "./dto/check-workflow-step.dto";
import { CreateGrowthFeedbackDto } from "./dto/create-growth-feedback.dto";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { CreateTeachingRecordDto } from "./dto/create-teaching-record.dto";
import { SendTeacherMessageDto } from "./dto/send-teacher-message.dto";
import { UpdateHomeworkSubmissionDto } from "./dto/update-homework-submission.dto";

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
    const checkedAt = new Date();
    const updatedStep = await this.prisma.workflowStep.update({
      where: { id: stepId },
      data: {
        checked: true,
        checkedAt,
        teacherId,
        photoUrls: dto.photoUrls ?? [],
      },
      select: {
        id: true,
        stepKey: true,
        name: true,
        timeRange: true,
        sortOrder: true,
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

    const students = await this.prisma.student.findMany({
      where: { classId: dto.classId },
      select: { id: true },
    });

    const homework = await this.prisma.homeworkAssignment.create({
      data: {
        classId: dto.classId,
        teacherId,
        title: dto.title,
        subject: dto.subject,
        content: dto.content,
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

    await this.audit.log({
      userId: teacherId,
      action: "teacher.homework.create",
      targetType: "HomeworkAssignment",
      targetId: homework.id,
      detail: {
        classId: dto.classId,
        submissionCount: homework.submissions.length,
      },
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

    const updated = await this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        content: dto.content,
        fileUrls: dto.fileUrls,
        submittedAt:
          dto.submittedAt === undefined
            ? undefined
            : dto.submittedAt
              ? new Date(dto.submittedAt)
              : null,
        reviewedAt:
          dto.reviewedAt === undefined
            ? undefined
            : dto.reviewedAt
              ? new Date(dto.reviewedAt)
              : null,
        remark: dto.remark,
      },
      include: {
        homework: { select: { id: true, title: true } },
        student: { select: { id: true, name: true } },
      },
    });

    if (dto.status) {
      await this.prisma.growthRecord.create({
        data: {
          studentId: submission.studentId,
          teacherId,
          type: GrowthRecordType.homework,
          title: `${submission.homework.title}状态更新`,
          content: `${submission.student.name} 的作业状态已更新为 ${dto.status}。`,
        },
      });
    }

    await this.audit.log({
      userId: teacherId,
      action: "teacher.homeworkSubmission.update",
      targetType: "HomeworkSubmission",
      targetId: updated.id,
      detail: {
        status: dto.status,
      },
    });

    return { data: updated };
  }

  async conversations(teacherId: string) {
    await this.ensureTeacherConversations(teacherId);

    const conversations = await this.prisma.conversation.findMany({
      where: { teacherId },
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

    const data = await Promise.all(
      conversations.map(async (conversation) => ({
        ...conversation,
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

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: teacherId,
        kind: dto.kind ?? MessageKind.text,
        content: dto.content,
        fileUrls: dto.fileUrls ?? [],
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return { data: message };
  }

  private async ensureTeacherConversations(teacherId: string) {
    const guardians = await this.prisma.studentGuardian.findMany({
      where: {
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
      select: { id: true },
    });

    if (!conversation) {
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
          checked: true,
          checkedAt: true,
          photoUrls: true,
        },
      },
    } satisfies Prisma.WorkflowSessionSelect;
  }
}
