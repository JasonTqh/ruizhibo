import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GrowthRecordType, HomeworkStatus, MessageKind } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SendParentMessageDto } from "./dto/send-parent-message.dto";
import { SubmitHomeworkDto } from "./dto/submit-homework.dto";

@Injectable()
export class ParentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async children(parentId: string) {
    const bindings = await this.prisma.studentGuardian.findMany({
      where: { parentId, status: "active" },
      orderBy: { createdAt: "asc" },
      include: {
        student: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                teacherId: true,
              },
            },
          },
        },
      },
    });

    return {
      data: bindings.map((binding) => ({
        id: binding.student.id,
        name: binding.student.name,
        gender: binding.student.gender,
        birthday: binding.student.birthday,
        status: binding.student.status,
        relation: binding.relation,
        class: binding.student.class,
      })),
    };
  }

  async timeline(parentId: string, studentId: string) {
    await this.assertParentStudent(parentId, studentId, {
      canViewGrowth: true,
    });

    const records = await this.prisma.growthRecord.findMany({
      where: {
        studentId,
        visibleToParent: true,
      },
      orderBy: { happenedAt: "desc" },
      take: 50,
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { data: records };
  }

  async attendance(parentId: string, studentId: string) {
    await this.assertParentStudent(parentId, studentId, {
      canViewGrowth: true,
    });

    const events = await this.prisma.attendanceEvent.findMany({
      where: { studentId },
      orderBy: { happenedAt: "desc" },
      take: 50,
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { data: events };
  }

  async homework(parentId: string, studentId: string) {
    await this.assertParentStudent(parentId, studentId);

    const submissions = await this.prisma.homeworkSubmission.findMany({
      where: { studentId },
      orderBy: { homework: { createdAt: "desc" } },
      include: {
        homework: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return { data: submissions };
  }

  async submitHomework(
    parentId: string,
    submissionId: string,
    dto: SubmitHomeworkDto,
  ) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: {
        id: submissionId,
        student: {
          guardians: {
            some: { parentId, status: "active", canSubmitHomework: true },
          },
        },
      },
      include: {
        homework: {
          select: {
            id: true,
            title: true,
            teacherId: true,
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

    if (submission.status === HomeworkStatus.reviewed) {
      throw new ConflictException("Reviewed homework cannot be resubmitted");
    }

    const content = dto.content?.trim() ?? "";
    const fileUrls = Array.from(new Set(dto.fileUrls ?? []));
    if (!content && fileUrls.length === 0) {
      throw new BadRequestException("Homework content or image is required");
    }

    if (fileUrls.length > 0) {
      const ownedFileCount = await this.prisma.fileAsset.count({
        where: {
          ownerId: parentId,
          scene: "homework",
          url: { in: fileUrls },
        },
      });
      if (ownedFileCount !== fileUrls.length) {
        throw new BadRequestException("Homework image is invalid");
      }
    }

    const submittedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.homeworkSubmission.updateMany({
        where: {
          id: submission.id,
          status: {
            in: [
              HomeworkStatus.pending,
              HomeworkStatus.overdue,
              HomeworkStatus.submitted,
            ],
          },
        },
        data: {
          status: HomeworkStatus.submitted,
          content: content || null,
          fileUrls,
          submittedAt,
          reviewedAt: null,
          remark: null,
        },
      });

      if (result.count === 0) {
        throw new ConflictException("Homework status has changed");
      }

      if (submission.status !== HomeworkStatus.submitted) {
        await transaction.growthRecord.create({
          data: {
            studentId: submission.studentId,
            teacherId: submission.homework.teacherId,
            type: GrowthRecordType.homework,
            title: `${submission.homework.title}已提交`,
            content: `${submission.student.name}的作业已提交，等待老师批改。`,
            happenedAt: submittedAt,
          },
        });
      }

      await this.audit.log(
        {
          userId: parentId,
          action: "parent.homework.submit",
          targetType: "HomeworkSubmission",
          targetId: submission.id,
          detail: {
            homeworkId: submission.homeworkId,
            studentId: submission.studentId,
            fileCount: fileUrls.length,
            resubmitted: submission.status === HomeworkStatus.submitted,
          },
        },
        transaction,
      );

      return transaction.homeworkSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        include: {
          homework: { select: { id: true, title: true } },
          student: { select: { id: true, name: true } },
        },
      });
    });

    return { data: updated };
  }

  async notices(parentId: string) {
    const receipts = await this.prisma.noticeReceipt.findMany({
      where: {
        parentId,
        student: {
          guardians: {
            some: { parentId, status: "active", canReceiveNotice: true },
          },
        },
      },
      orderBy: {
        notice: {
          createdAt: "desc",
        },
      },
      include: {
        notice: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
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

    return {
      data: receipts.map((receipt) => ({
        id: receipt.id,
        viewedAt: receipt.viewedAt,
        confirmedAt: receipt.confirmedAt,
        status: receipt.confirmedAt
          ? "confirmed"
          : receipt.viewedAt
            ? "viewed"
            : "pending",
        notice: receipt.notice,
        student: receipt.student,
      })),
    };
  }

  async viewNotice(parentId: string, receiptId: string) {
    const receipt = await this.assertParentNoticeReceipt(parentId, receiptId);

    if (!receipt.viewedAt) {
      await this.prisma.noticeReceipt.updateMany({
        where: {
          id: receipt.id,
          viewedAt: null,
        },
        data: { viewedAt: new Date() },
      });
    }

    const updated = await this.prisma.noticeReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    return { data: updated };
  }

  async confirmNotice(parentId: string, receiptId: string) {
    const receipt = await this.assertParentNoticeReceipt(parentId, receiptId);

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.noticeReceipt.updateMany({
        where: {
          id: receipt.id,
          viewedAt: null,
        },
        data: { viewedAt: new Date() },
      });

      const result = await transaction.noticeReceipt.updateMany({
        where: {
          id: receipt.id,
          confirmedAt: null,
        },
        data: {
          confirmedAt: new Date(),
        },
      });

      if (result.count > 0) {
        await this.audit.log(
          {
            userId: parentId,
            action: "parent.notice.confirm",
            targetType: "NoticeReceipt",
            targetId: receipt.id,
            detail: {
              noticeId: receipt.noticeId,
              studentId: receipt.studentId,
            },
          },
          transaction,
        );
      }

      return transaction.noticeReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      });
    });

    return { data: updated };
  }

  async conversations(parentId: string) {
    await this.ensureParentConversations(parentId);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        parentId,
        student: {
          guardians: {
            some: { parentId, status: "active" },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
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
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const teacherIds = Array.from(
      new Set(conversations.map((item) => item.teacherId)),
    );
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, name: true, phone: true },
    });
    const teacherById = new Map(
      teachers.map((teacher) => [teacher.id, teacher]),
    );

    const data = await Promise.all(
      conversations.map(async (conversation) => ({
        ...conversation,
        teacher: teacherById.get(conversation.teacherId) ?? null,
        unreadCount: await this.unreadCount(conversation.id, parentId),
      })),
    );

    return { data };
  }

  async conversationMessages(parentId: string, conversationId: string) {
    await this.assertParentConversation(parentId, conversationId);

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: parentId },
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
    parentId: string,
    conversationId: string,
    dto: SendParentMessageDto,
  ) {
    await this.assertParentConversation(parentId, conversationId);

    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException("Message content is required");
    }

    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          conversationId,
          senderId: parentId,
          kind: dto.kind ?? MessageKind.text,
          content,
          fileUrls: dto.fileUrls ?? [],
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

  private async ensureParentConversations(parentId: string) {
    const bindings = await this.prisma.studentGuardian.findMany({
      where: { parentId, status: "active" },
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

    for (const binding of bindings) {
      const teacherId = binding.student.class.teacherId;
      if (!teacherId) continue;

      await this.prisma.conversation.upsert({
        where: {
          studentId_parentId_teacherId: {
            studentId: binding.studentId,
            parentId,
            teacherId,
          },
        },
        update: {},
        create: {
          studentId: binding.studentId,
          parentId,
          teacherId,
        },
      });
    }
  }

  private async assertParentStudent(
    parentId: string,
    studentId: string,
    permissions: { canViewGrowth?: boolean } = {},
  ) {
    const binding = await this.prisma.studentGuardian.findFirst({
      where: {
        parentId,
        studentId,
        status: "active",
        ...permissions,
      },
      select: { id: true },
    });

    if (!binding) {
      throw new NotFoundException("Student not found");
    }
  }

  private async assertParentNoticeReceipt(parentId: string, receiptId: string) {
    const receipt = await this.prisma.noticeReceipt.findFirst({
      where: {
        id: receiptId,
        parentId,
        student: {
          guardians: {
            some: { parentId, status: "active", canReceiveNotice: true },
          },
        },
      },
      select: {
        id: true,
        noticeId: true,
        studentId: true,
        viewedAt: true,
        confirmedAt: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException("Notice receipt not found");
    }

    return receipt;
  }

  private async assertParentConversation(
    parentId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        parentId,
        student: {
          guardians: {
            some: { parentId, status: "active" },
          },
        },
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
}
