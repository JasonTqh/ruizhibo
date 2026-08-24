import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TrainingPermission, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TrainingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertPermission(
    userId: string,
    permission: TrainingPermission,
    campusId?: string,
  ) {
    const grant = await this.prisma.trainingPermissionGrant.findFirst({
      where: {
        userId,
        permission,
        isActive: true,
        scopeKey: campusId ? { in: ["GLOBAL", campusId] } : "GLOBAL",
      },
      select: { id: true },
    });
    if (!grant) {
      throw new ForbiddenException("没有相应的培训权限或校区数据权限");
    }
  }

  async campusScope(userId: string, permission: TrainingPermission) {
    const grants = await this.prisma.trainingPermissionGrant.findMany({
      where: { userId, permission, isActive: true },
      select: { campusId: true, scopeKey: true },
    });
    if (grants.some((grant) => grant.scopeKey === "GLOBAL")) return null;
    return grants
      .map((grant) => grant.campusId)
      .filter((campusId): campusId is string => Boolean(campusId));
  }

  async hasGlobalPermission(userId: string, permission: TrainingPermission) {
    const grant = await this.prisma.trainingPermissionGrant.findFirst({
      where: {
        userId,
        permission,
        isActive: true,
        scopeKey: "GLOBAL",
      },
      select: { id: true },
    });
    return Boolean(grant);
  }

  async assertPracticalReviewer(input: {
    actorId: string;
    campusId: string;
    mentorId: string | null;
  }) {
    if (input.mentorId === input.actorId) return;
    await this.assertPermission(
      input.actorId,
      TrainingPermission.practical_confirm,
      input.campusId,
    );
  }

  async assertTeacherInCampus(teacherId: string, campusId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: {
        id: teacherId,
        role: UserRole.teacher,
        OR: [
          { teachingClasses: { some: { campusId } } },
          { trainingAssignments: { some: { campusId } } },
        ],
      },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException("教师不属于所选校区");
  }

  async isCampusEnabled(campusId: string) {
    const flag = await this.prisma.trainingFeatureFlag.findUnique({
      where: { campusId },
      select: { enabled: true },
    });
    return flag?.enabled ?? false;
  }

  async assertCampusEnabled(campusId: string) {
    if (!(await this.isCampusEnabled(campusId))) {
      throw new ForbiddenException("该校区暂未开放教师学院");
    }
  }
}
