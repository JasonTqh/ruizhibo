import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageKind } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SendParentMessageDto } from "./dto/send-parent-message.dto";

@Injectable()
export class ParentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async children(parentId: string) {
    const bindings = await this.prisma.studentGuardian.findMany({
      where: { parentId },
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
    await this.assertParentStudent(parentId, studentId);

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
    await this.assertParentStudent(parentId, studentId);

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

  async notices(parentId: string) {
    const receipts = await this.prisma.noticeReceipt.findMany({
      where: {
        parentId,
        student: {
          guardians: {
            some: { parentId },
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
      where: { parentId },
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

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: parentId,
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

  private async ensureParentConversations(parentId: string) {
    const bindings = await this.prisma.studentGuardian.findMany({
      where: { parentId },
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

  private async assertParentStudent(parentId: string, studentId: string) {
    const binding = await this.prisma.studentGuardian.findFirst({
      where: {
        parentId,
        studentId,
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
            some: { parentId },
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
