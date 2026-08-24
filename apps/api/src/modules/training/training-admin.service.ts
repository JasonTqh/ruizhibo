import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TeacherEmploymentStatus,
  TrainingPermission,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  SetTrainingFeatureFlagDto,
  SetTrainingPermissionDto,
  TrainingListQueryDto,
} from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";

@Injectable()
export class TrainingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
  ) {}

  async capabilities(actorId: string) {
    const [grants, mentoredAssignments] = await Promise.all([
      this.prisma.trainingPermissionGrant.findMany({
        where: { userId: actorId, isActive: true },
        select: { permission: true, scopeKey: true, campusId: true },
      }),
      this.prisma.trainingAssignment.count({ where: { mentorId: actorId } }),
    ]);
    const manage = grants.filter(
      (grant) => grant.permission === TrainingPermission.training_manage,
    );
    const globalTrainingManage = manage.some(
      (grant) => grant.scopeKey === "GLOBAL",
    );
    const practicalGranted = grants.some(
      (grant) => grant.permission === TrainingPermission.practical_confirm,
    );
    return {
      data: {
        trainingManage: manage.length > 0,
        globalTrainingManage,
        courseManage: globalTrainingManage,
        permissionManage: globalTrainingManage,
        practicalConfirm: practicalGranted || mentoredAssignments > 0,
        safetyConfirm: grants.some(
          (grant) => grant.permission === TrainingPermission.safety_confirm,
        ),
        campusIds: [
          ...new Set(
            grants
              .map((grant) => grant.campusId)
              .filter((campusId): campusId is string => Boolean(campusId)),
          ),
        ],
      },
    };
  }

  async assignmentSubjects(actorId: string) {
    const scope = await this.access.campusScope(
      actorId,
      TrainingPermission.training_manage,
    );
    if (scope?.length === 0) throw new ForbiddenException("没有培训管理权限");
    const campusWhere = scope === null ? undefined : { in: scope };
    const teacherScope =
      scope === null
        ? undefined
        : {
            OR: [
              { teachingClasses: { some: { campusId: { in: scope } } } },
              { trainingAssignments: { some: { campusId: { in: scope } } } },
            ],
          };
    const grantScopes = scope === null ? undefined : ["GLOBAL", ...scope];
    const [campuses, teachers, administratorMentors] = await Promise.all([
      this.prisma.campus.findMany({
        where: { id: campusWhere },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: {
          role: UserRole.teacher,
          status: UserStatus.active,
          employmentStatus: TeacherEmploymentStatus.employed,
          ...teacherScope,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          employmentStatus: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          role: UserRole.admin,
          status: UserStatus.active,
          trainingGrants: {
            some: {
              isActive: true,
              permission: {
                in: [
                  TrainingPermission.training_manage,
                  TrainingPermission.practical_confirm,
                ],
              },
              scopeKey: grantScopes ? { in: grantScopes } : undefined,
            },
          },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, status: true },
      }),
    ]);
    const mentorMap = new Map(
      [...teachers, ...administratorMentors].map((person) => [person.id, person]),
    );
    return {
      data: { campuses, teachers, mentors: [...mentorMap.values()] },
    };
  }

  async listPermissions(actorId: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const grants = await this.prisma.trainingPermissionGrant.findMany({
      orderBy: [{ userId: "asc" }, { permission: "asc" }, { scopeKey: "asc" }],
      include: {
        user: {
          select: { id: true, name: true, phone: true, role: true, status: true },
        },
        campus: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return { data: grants };
  }

  async listPermissionSubjects(actorId: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.admin },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, role: true, status: true },
    });
    return { data: users };
  }

  async setPermission(actorId: string, dto: SetTrainingPermissionDto) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const [user, campus] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      dto.campusId
        ? this.prisma.campus.findUnique({ where: { id: dto.campusId } })
        : Promise.resolve(null),
    ]);
    if (!user) throw new NotFoundException("授权账号不存在");
    if (user.role !== UserRole.admin) {
      throw new ForbiddenException("培训后台权限只能授予现有管理员账号");
    }
    if (dto.campusId && !campus) throw new NotFoundException("授权校区不存在");
    const scopeKey = dto.campusId ?? "GLOBAL";
    const current = await this.prisma.trainingPermissionGrant.findUnique({
      where: {
        userId_permission_scopeKey: {
          userId: dto.userId,
          permission: dto.permission,
          scopeKey,
        },
      },
    });
    const grant = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trainingPermissionGrant.upsert({
        where: {
          userId_permission_scopeKey: {
            userId: dto.userId,
            permission: dto.permission,
            scopeKey,
          },
        },
        update: { campusId: dto.campusId ?? null, isActive: dto.isActive },
        create: {
          userId: dto.userId,
          campusId: dto.campusId ?? null,
          scopeKey,
          permission: dto.permission,
          isActive: dto.isActive,
          createdById: actorId,
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId: dto.campusId ?? null,
          action: "permission.change",
          targetType: "TrainingPermissionGrant",
          targetId: updated.id,
          before: current
            ? {
                permission: current.permission,
                scopeKey: current.scopeKey,
                isActive: current.isActive,
              }
            : null,
          after: {
            userId: dto.userId,
            permission: dto.permission,
            scopeKey,
            isActive: dto.isActive,
          },
          reason: dto.reason,
        },
        tx,
      );
      return updated;
    });
    return { data: grant };
  }

  async listFlags(actorId: string) {
    const scope = await this.access.campusScope(
      actorId,
      TrainingPermission.training_manage,
    );
    if (scope?.length === 0) throw new ForbiddenException("没有培训管理权限");
    const campuses = await this.prisma.campus.findMany({
      where: { id: scope === null ? undefined : { in: scope } },
      orderBy: { name: "asc" },
      include: {
        trainingFeatureFlag: {
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });
    return {
      data: campuses.map((campus) => ({
        campus: { id: campus.id, name: campus.name },
        enabled: campus.trainingFeatureFlag?.enabled ?? false,
        reason: campus.trainingFeatureFlag?.reason ?? "尚未启用",
        updatedAt: campus.trainingFeatureFlag?.updatedAt ?? null,
        updatedBy: campus.trainingFeatureFlag?.updatedBy ?? null,
      })),
    };
  }

  async setFlag(
    actorId: string,
    campusId: string,
    dto: SetTrainingFeatureFlagDto,
  ) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
      campusId,
    );
    const campus = await this.prisma.campus.findUnique({ where: { id: campusId } });
    if (!campus) throw new NotFoundException("校区不存在");
    const current = await this.prisma.trainingFeatureFlag.findUnique({
      where: { campusId },
    });
    const flag = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trainingFeatureFlag.upsert({
        where: { campusId },
        update: {
          enabled: dto.enabled,
          reason: dto.reason.trim(),
          updatedById: actorId,
        },
        create: {
          campusId,
          enabled: dto.enabled,
          reason: dto.reason.trim(),
          updatedById: actorId,
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId,
          action: "feature_flag.change",
          targetType: "TrainingFeatureFlag",
          targetId: campusId,
          before: current
            ? { enabled: current.enabled, reason: current.reason }
            : null,
          after: { enabled: dto.enabled, reason: dto.reason.trim() },
          reason: dto.reason.trim(),
        },
        tx,
      );
      return updated;
    });
    return { data: flag };
  }

  async feedback(actorId: string, query: TrainingListQueryDto) {
    const campusFilter = await this.authorizedCampusFilter(actorId, query.campusId);
    const where: Prisma.TrainingFeedbackWhereInput = {
      assignment: {
        campusId: campusFilter,
        teacherId: query.teacherId,
        teacher: query.teacherName
          ? { name: { contains: query.teacherName, mode: "insensitive" } }
          : undefined,
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingFeedback.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          teacher: { select: { id: true, name: true, phone: true } },
          assignment: {
            include: { campus: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.trainingFeedback.count({ where }),
    ]);
    return { data: { items, total, page: query.page, pageSize: query.pageSize } };
  }

  async audits(actorId: string, campusId?: string) {
    const campusFilter = await this.authorizedCampusFilter(actorId, campusId);
    const records = await this.prisma.trainingAuditRecord.findMany({
      where: { campusId: campusFilter },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    return { data: records };
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
}
