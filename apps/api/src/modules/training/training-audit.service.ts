import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type TrainingAuditClient = Pick<
  PrismaService,
  "trainingAuditRecord" | "auditLog"
>;

export interface TrainingAuditInput {
  actorId?: string | null;
  campusId?: string | null;
  assignmentId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
}
@Injectable()
export class TrainingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    input: TrainingAuditInput,
    client: TrainingAuditClient = this.prisma,
  ) {
    const record = await client.trainingAuditRecord.create({
      data: {
        actorId: input.actorId ?? null,
        campusId: input.campusId ?? null,
        assignmentId: input.assignmentId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        before: input.before ?? Prisma.JsonNull,
        after: input.after ?? Prisma.JsonNull,
        reason: input.reason ?? null,
      },
    });
    await client.auditLog.create({
      data: {
        userId: input.actorId ?? null,
        action: `training.${input.action}`,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        detail: {
          campusId: input.campusId ?? null,
          assignmentId: input.assignmentId ?? null,
          before: input.before ?? null,
          after: input.after ?? null,
          reason: input.reason ?? null,
          trainingAuditRecordId: record.id,
        },
      },
    });
    return record;
  }
}
