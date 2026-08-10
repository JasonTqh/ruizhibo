import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface AuditLogInput {
  userId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: Prisma.InputJsonValue;
}

type AuditClient = Pick<PrismaService, "auditLog">;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput, client: AuditClient = this.prisma) {
    return client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        detail: input.detail ?? Prisma.JsonNull,
      },
    });
  }

  async listRecent(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            role: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }
}
