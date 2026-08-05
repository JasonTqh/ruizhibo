import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StudentStatus, UserRole, UserStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { BindGuardianDto } from "./dto/bind-guardian.dto";
import { CreateClassDto } from "./dto/create-class.dto";
import { CreateStudentDto } from "./dto/create-student.dto";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateWorkflowTemplateDto } from "./dto/create-workflow-template.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { UpdateWorkflowTemplateDto } from "./dto/update-workflow-template.dto";

const userSummarySelect = {
  id: true,
  role: true,
  name: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listTeachers() {
    const teachers = await this.prisma.user.findMany({
      where: { role: UserRole.teacher },
      orderBy: { createdAt: "desc" },
      select: userSummarySelect,
    });

    return { data: teachers };
  }

  async createTeacher(actorId: string, dto: CreateTeacherDto) {
    await this.assertPhoneAvailable(dto.phone);

    const teacher = await this.prisma.user.create({
      data: {
        role: UserRole.teacher,
        name: dto.name,
        phone: dto.phone,
        status: dto.status ?? UserStatus.active,
      },
      select: userSummarySelect,
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.teacher.create",
      targetType: "User",
      targetId: teacher.id,
      detail: { phone: teacher.phone },
    });

    return { data: teacher };
  }

  async updateTeacher(actorId: string, id: string, dto: UpdateTeacherDto) {
    await this.assertUserWithRoleExists(id, UserRole.teacher, "Teacher");

    if (dto.phone) {
      await this.assertPhoneAvailable(dto.phone, id);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.status !== undefined) data.status = dto.status;

    const teacher = await this.prisma.user.update({
      where: { id },
      data,
      select: userSummarySelect,
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.teacher.update",
      targetType: "User",
      targetId: teacher.id,
      detail: dto as Prisma.InputJsonValue,
    });

    return { data: teacher };
  }

  async listClasses() {
    const classes = await this.prisma.class.findMany({
      orderBy: { createdAt: "desc" },
      select: {
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
        teacher: {
          select: userSummarySelect,
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
    });

    return { data: classes };
  }

  async createClass(actorId: string, dto: CreateClassDto) {
    await this.assertCampusExists(dto.campusId);
    const teacherId = this.normalizeOptionalId(dto.teacherId);
    if (teacherId) {
      await this.assertUserWithRoleExists(teacherId, UserRole.teacher, "Teacher");
    }

    const klass = await this.prisma.class.create({
      data: {
        campusId: dto.campusId,
        name: dto.name,
        teacherId,
      },
      select: this.classSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.class.create",
      targetType: "Class",
      targetId: klass.id,
      detail: { teacherId: klass.teacherId },
    });

    return { data: klass };
  }

  async updateClass(actorId: string, id: string, dto: UpdateClassDto) {
    await this.assertClassExists(id);

    const data: Prisma.ClassUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.campusId !== undefined) {
      await this.assertCampusExists(dto.campusId);
      data.campusId = dto.campusId;
    }
    if (dto.teacherId !== undefined) {
      const teacherId = this.normalizeOptionalId(dto.teacherId);
      if (teacherId) {
        await this.assertUserWithRoleExists(teacherId, UserRole.teacher, "Teacher");
      }
      data.teacherId = teacherId;
    }

    const klass = await this.prisma.class.update({
      where: { id },
      data,
      select: this.classSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.class.update",
      targetType: "Class",
      targetId: klass.id,
      detail: dto as Prisma.InputJsonValue,
    });

    return { data: klass };
  }

  async listStudents() {
    const students = await this.prisma.student.findMany({
      orderBy: { createdAt: "desc" },
      select: this.studentSelect(),
    });

    return { data: students };
  }

  async createStudent(actorId: string, dto: CreateStudentDto) {
    await this.assertClassExists(dto.classId);

    const student = await this.prisma.student.create({
      data: {
        classId: dto.classId,
        name: dto.name,
        gender: dto.gender ?? null,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        status: dto.status ?? StudentStatus.active,
      },
      select: this.studentSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.student.create",
      targetType: "Student",
      targetId: student.id,
      detail: { classId: student.classId },
    });

    return { data: student };
  }

  async updateStudent(actorId: string, id: string, dto: UpdateStudentDto) {
    await this.assertStudentExists(id);

    const data: Prisma.StudentUncheckedUpdateInput = {};
    if (dto.classId !== undefined) {
      await this.assertClassExists(dto.classId);
      data.classId = dto.classId;
    }
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthday !== undefined) {
      data.birthday = dto.birthday ? new Date(dto.birthday) : null;
    }
    if (dto.status !== undefined) data.status = dto.status;

    const student = await this.prisma.student.update({
      where: { id },
      data,
      select: this.studentSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.student.update",
      targetType: "Student",
      targetId: student.id,
      detail: dto as Prisma.InputJsonValue,
    });

    return { data: student };
  }

  async bindGuardian(actorId: string, studentId: string, dto: BindGuardianDto) {
    await this.assertStudentExists(studentId);

    const parent = await this.resolveGuardianParent(dto);

    try {
      const guardian = await this.prisma.studentGuardian.create({
        data: {
          studentId,
          parentId: parent.id,
          relation: dto.relation,
        },
        select: this.guardianSelect(),
      });

      await this.audit.log({
        userId: actorId,
        action: "admin.guardian.bind",
        targetType: "StudentGuardian",
        targetId: guardian.id,
        detail: {
          studentId,
          parentId: guardian.parentId,
        },
      });

      return { data: guardian };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Guardian is already bound to this student");
      }
      throw error;
    }
  }

  async unbindGuardian(actorId: string, studentId: string, guardianId: string) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: {
        id: guardianId,
        studentId,
      },
      select: {
        id: true,
      },
    });

    if (!guardian) {
      throw new NotFoundException("Guardian binding not found");
    }

    const deleted = await this.prisma.studentGuardian.delete({
      where: { id: guardianId },
      select: this.guardianSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.guardian.unbind",
      targetType: "StudentGuardian",
      targetId: deleted.id,
      detail: {
        studentId,
        parentId: deleted.parentId,
      },
    });

    return { data: deleted };
  }

  async listWorkflowTemplates() {
    const templates = await this.prisma.workflowTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: this.workflowTemplateSelect(),
    });

    return { data: templates };
  }

  async createWorkflowTemplate(actorId: string, dto: CreateWorkflowTemplateDto) {
    this.assertUniqueStepKeys(dto.steps);

    const template = await this.prisma.workflowTemplate.create({
      data: {
        name: dto.name,
        version: dto.version ?? 1,
        isActive: dto.isActive ?? true,
        steps: {
          create: dto.steps.map((step) => ({
            stepKey: step.stepKey,
            name: step.name,
            timeRange: step.timeRange,
            sortOrder: step.sortOrder,
            requirePhoto: step.requirePhoto ?? false,
          })),
        },
      },
      select: this.workflowTemplateSelect(),
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.workflowTemplate.create",
      targetType: "WorkflowTemplate",
      targetId: template.id,
      detail: {
        stepCount: template.steps.length,
      },
    });

    return { data: template };
  }

  async updateWorkflowTemplate(
    actorId: string,
    id: string,
    dto: UpdateWorkflowTemplateDto,
  ) {
    await this.assertWorkflowTemplateExists(id);
    if (dto.steps) {
      this.assertUniqueStepKeys(dto.steps);
    }

    const template = await this.prisma.$transaction(async (tx) => {
      if (dto.steps) {
        await tx.workflowTemplateStep.deleteMany({
          where: { templateId: id },
        });
      }

      return tx.workflowTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          version: dto.version,
          isActive: dto.isActive,
          steps: dto.steps
            ? {
                create: dto.steps.map((step) => ({
                  stepKey: step.stepKey,
                  name: step.name,
                  timeRange: step.timeRange,
                  sortOrder: step.sortOrder,
                  requirePhoto: step.requirePhoto ?? false,
                })),
              }
            : undefined,
        },
        select: this.workflowTemplateSelect(),
      });
    });

    await this.audit.log({
      userId: actorId,
      action: "admin.workflowTemplate.update",
      targetType: "WorkflowTemplate",
      targetId: template.id,
      detail: {
        name: dto.name,
        version: dto.version,
        isActive: dto.isActive,
        stepCount: dto.steps?.length,
      },
    });

    return { data: template };
  }

  async auditLogs() {
    const logs = await this.audit.listRecent();
    return { data: logs };
  }

  private async resolveGuardianParent(dto: BindGuardianDto) {
    if (dto.parentId) {
      return this.assertUserWithRoleExists(dto.parentId, UserRole.parent, "Parent");
    }

    if (!dto.parentPhone) {
      throw new BadRequestException("parentId or parentPhone is required");
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.parentPhone },
      select: userSummarySelect,
    });

    if (existing) {
      if (existing.role !== UserRole.parent) {
        throw new ConflictException("Phone number is already used by another role");
      }

      if (dto.parentName && dto.parentName !== existing.name) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { name: dto.parentName },
          select: userSummarySelect,
        });
      }

      return existing;
    }

    if (!dto.parentName) {
      throw new BadRequestException("parentName is required when creating a parent");
    }

    return this.prisma.user.create({
      data: {
        role: UserRole.parent,
        name: dto.parentName,
        phone: dto.parentPhone,
      },
      select: userSummarySelect,
    });
  }

  private async assertPhoneAvailable(phone: string, exceptUserId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
      },
    });

    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException("Phone number is already used");
    }
  }

  private async assertUserWithRoleExists(
    id: string,
    role: UserRole,
    label: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role,
      },
      select: userSummarySelect,
    });

    if (!user) {
      throw new NotFoundException(`${label} not found`);
    }

    return user;
  }

  private async assertCampusExists(id: string) {
    const campus = await this.prisma.campus.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!campus) {
      throw new NotFoundException("Campus not found");
    }
  }

  private async assertClassExists(id: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!klass) {
      throw new NotFoundException("Class not found");
    }
  }

  private async assertStudentExists(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }
  }

  private async assertWorkflowTemplateExists(id: string) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException("Workflow template not found");
    }
  }

  private assertUniqueStepKeys(steps: Array<{ stepKey: string }>) {
    const keys = new Set<string>();
    for (const step of steps) {
      if (keys.has(step.stepKey)) {
        throw new ConflictException("Workflow template stepKey must be unique");
      }
      keys.add(step.stepKey);
    }
  }

  private normalizeOptionalId(value: string | null | undefined) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    return value;
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
      teacher: {
        select: userSummarySelect,
      },
      _count: {
        select: {
          students: true,
        },
      },
    } satisfies Prisma.ClassSelect;
  }

  private studentSelect() {
    return {
      id: true,
      classId: true,
      name: true,
      gender: true,
      birthday: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      class: {
        select: {
          id: true,
          name: true,
          campus: {
            select: {
              id: true,
              name: true,
            },
          },
          teacher: {
            select: userSummarySelect,
          },
        },
      },
      guardians: {
        select: this.guardianSelect(),
      },
    } satisfies Prisma.StudentSelect;
  }

  private guardianSelect() {
    return {
      id: true,
      relation: true,
      studentId: true,
      parentId: true,
      createdAt: true,
      parent: {
        select: userSummarySelect,
      },
    } satisfies Prisma.StudentGuardianSelect;
  }

  private workflowTemplateSelect() {
    return {
      id: true,
      name: true,
      version: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      steps: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          stepKey: true,
          name: true,
          timeRange: true,
          sortOrder: true,
          requirePhoto: true,
        },
      },
    } satisfies Prisma.WorkflowTemplateSelect;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
