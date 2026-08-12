import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceType,
  GrowthRecordType,
  HomeworkStatus,
  LessonPlanStatus,
  Prisma,
  ResearchActivityType,
  ResearchActivityStatus,
  StudentStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
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
import { UpdateGuardianDto } from "./dto/update-guardian.dto";
import { BusinessQueryDto } from "./dto/business-query.dto";

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

  async deleteTeacher(actorId: string, id: string) {
    await this.assertUserWithRoleExists(id, UserRole.teacher, "Teacher");
    const teacher = await this.deleteWithRelationCheck(
      () =>
        this.prisma.user.delete({ where: { id }, select: userSummarySelect }),
      "该老师已有班级或业务记录，不能删除；可将状态改为停用",
    );
    await this.audit.log({
      userId: actorId,
      action: "admin.teacher.delete",
      targetType: "User",
      targetId: id,
    });
    return { data: teacher };
  }

  async listParents() {
    const parents = await this.prisma.user.findMany({
      where: { role: UserRole.parent },
      orderBy: { createdAt: "desc" },
      select: {
        ...userSummarySelect,
        guardianships: {
          select: {
            id: true,
            relation: true,
            isPrimary: true,
            canReceiveNotice: true,
            canSubmitHomework: true,
            canViewGrowth: true,
            status: true,
            remark: true,
            student: {
              select: {
                id: true,
                name: true,
                class: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return { data: parents };
  }

  async createParent(actorId: string, dto: CreateTeacherDto) {
    await this.assertPhoneAvailable(dto.phone);
    const parent = await this.prisma.user.create({
      data: {
        role: UserRole.parent,
        name: dto.name,
        phone: dto.phone,
        status: dto.status ?? UserStatus.active,
      },
      select: userSummarySelect,
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.parent.create",
      targetType: "User",
      targetId: parent.id,
      detail: { phone: parent.phone },
    });
    return { data: parent };
  }

  async updateParent(actorId: string, id: string, dto: UpdateTeacherDto) {
    await this.assertUserWithRoleExists(id, UserRole.parent, "Parent");
    if (dto.phone) await this.assertPhoneAvailable(dto.phone, id);
    const parent = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name, phone: dto.phone, status: dto.status },
      select: userSummarySelect,
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.parent.update",
      targetType: "User",
      targetId: id,
      detail: dto as Prisma.InputJsonValue,
    });
    return { data: parent };
  }

  async parentReferences(id: string) {
    await this.assertUserWithRoleExists(id, UserRole.parent, "Parent");
    const [guardianships, noticeReceipts, conversations] = await Promise.all([
      this.prisma.studentGuardian.count({ where: { parentId: id } }),
      this.prisma.noticeReceipt.count({ where: { parentId: id } }),
      this.prisma.conversation.count({ where: { parentId: id } }),
    ]);
    return { data: { guardianships, noticeReceipts, conversations } };
  }

  async deleteParent(actorId: string, id: string, force = false) {
    const current = await this.prisma.user.findFirst({
      where: { id, role: UserRole.parent },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException("Parent not found");
    if (force && current.status === UserStatus.active) {
      throw new BadRequestException("请先将家长设为停用，再清理引用并删除");
    }
    const parent = await this.deleteWithRelationCheck(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (force) {
            await tx.message.deleteMany({
              where: { conversation: { parentId: id } },
            });
            await tx.conversation.deleteMany({ where: { parentId: id } });
            await tx.noticeReceipt.deleteMany({ where: { parentId: id } });
            await tx.studentGuardian.deleteMany({ where: { parentId: id } });
            await tx.auditLog.updateMany({
              where: { userId: id },
              data: { userId: null },
            });
          }
          return tx.user.delete({ where: { id }, select: userSummarySelect });
        }),
      "该家长已有学生绑定或业务记录，不能删除；可先停用后清理引用",
    );
    await this.audit.log({
      userId: actorId,
      action: "admin.parent.delete",
      targetType: "User",
      targetId: id,
      detail: { force },
    });
    return { data: parent };
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
      await this.assertUserWithRoleExists(
        teacherId,
        UserRole.teacher,
        "Teacher",
      );
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
        await this.assertUserWithRoleExists(
          teacherId,
          UserRole.teacher,
          "Teacher",
        );
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

  async classReferences(id: string) {
    await this.assertClassExists(id);
    const [
      direct,
      guardians,
      attendance,
      submissions,
      growthRecords,
      conversations,
      noticeReceipts,
    ] = await Promise.all([
      this.prisma.class.findUniqueOrThrow({
        where: { id },
        select: {
          _count: {
            select: {
              students: true,
              workflowSessions: true,
              homeworkAssignments: true,
              teachingRecords: true,
              lessonPlans: true,
              notices: true,
            },
          },
        },
      }),
      this.prisma.studentGuardian.count({
        where: { student: { classId: id } },
      }),
      this.prisma.attendanceEvent.count({
        where: { student: { classId: id } },
      }),
      this.prisma.homeworkSubmission.count({
        where: { student: { classId: id } },
      }),
      this.prisma.growthRecord.count({ where: { student: { classId: id } } }),
      this.prisma.conversation.count({ where: { student: { classId: id } } }),
      this.prisma.noticeReceipt.count({ where: { student: { classId: id } } }),
    ]);
    return {
      data: {
        ...direct._count,
        studentGuardians: guardians,
        studentAttendance: attendance,
        studentSubmissions: submissions,
        studentGrowthRecords: growthRecords,
        studentConversations: conversations,
        studentNoticeReceipts: noticeReceipts,
      },
    };
  }

  async deleteClass(actorId: string, id: string, force = false) {
    await this.assertClassExists(id);
    const klass = await this.deleteWithRelationCheck(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (force) {
            await tx.message.deleteMany({
              where: { conversation: { student: { classId: id } } },
            });
            await tx.workflowStep.deleteMany({
              where: { session: { classId: id } },
            });
            await tx.noticeReceipt.deleteMany({
              where: {
                OR: [{ notice: { classId: id } }, { student: { classId: id } }],
              },
            });
            await tx.homeworkSubmission.deleteMany({
              where: {
                OR: [
                  { homework: { classId: id } },
                  { student: { classId: id } },
                ],
              },
            });
            await tx.studentGuardian.deleteMany({
              where: { student: { classId: id } },
            });
            await tx.attendanceEvent.deleteMany({
              where: { student: { classId: id } },
            });
            await tx.growthRecord.deleteMany({
              where: { student: { classId: id } },
            });
            await tx.conversation.deleteMany({
              where: { student: { classId: id } },
            });
            await tx.workflowSession.deleteMany({ where: { classId: id } });
            await tx.homeworkAssignment.deleteMany({ where: { classId: id } });
            await tx.teachingRecord.deleteMany({ where: { classId: id } });
            await tx.lessonPlan.deleteMany({ where: { classId: id } });
            await tx.notice.deleteMany({ where: { classId: id } });
            await tx.student.deleteMany({ where: { classId: id } });
          }
          return tx.class.delete({ where: { id }, select: this.classSelect() });
        }),
      "该班级已有学生或业务记录，不能删除",
    );
    await this.audit.log({
      userId: actorId,
      action: "admin.class.delete",
      targetType: "Class",
      targetId: id,
      detail: { force },
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

  async studentReferences(id: string) {
    await this.assertStudentExists(id);
    const counts = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      select: {
        _count: {
          select: {
            guardians: true,
            attendance: true,
            submissions: true,
            growthRecords: true,
            conversations: true,
            noticeReceipts: true,
          },
        },
      },
    });
    return { data: counts._count };
  }

  async deleteStudent(actorId: string, id: string, force = false) {
    const current = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException("Student not found");
    if (force && current.status === StudentStatus.active) {
      throw new BadRequestException(
        "请先将学生状态设为停用或结业，再清理引用并删除",
      );
    }
    const student = await this.deleteWithRelationCheck(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (force) {
            await tx.message.deleteMany({
              where: { conversation: { studentId: id } },
            });
            await tx.noticeReceipt.deleteMany({ where: { studentId: id } });
            await tx.homeworkSubmission.deleteMany({
              where: { studentId: id },
            });
            await tx.studentGuardian.deleteMany({ where: { studentId: id } });
            await tx.attendanceEvent.deleteMany({ where: { studentId: id } });
            await tx.growthRecord.deleteMany({ where: { studentId: id } });
            await tx.conversation.deleteMany({ where: { studentId: id } });
          }
          return tx.student.delete({
            where: { id },
            select: this.studentSelect(),
          });
        }),
      "该学生已有家长绑定或业务记录，不能删除；可将状态改为停用",
    );
    await this.audit.log({
      userId: actorId,
      action: "admin.student.delete",
      targetType: "Student",
      targetId: id,
      detail: { force },
    });
    return { data: student };
  }

  async bindGuardian(actorId: string, studentId: string, dto: BindGuardianDto) {
    await this.assertStudentExists(studentId);

    const parent = await this.resolveGuardianParent(dto);

    try {
      const guardian = await this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary && (dto.status ?? "active") === "active") {
          await tx.studentGuardian.updateMany({
            where: { studentId, status: "active" },
            data: { isPrimary: false },
          });
        }
        return tx.studentGuardian.upsert({
          where: { studentId_parentId: { studentId, parentId: parent.id } },
          create: {
            studentId,
            parentId: parent.id,
            relation: dto.relation,
            isPrimary:
              (dto.status ?? "active") === "active"
                ? (dto.isPrimary ?? false)
                : false,
            canReceiveNotice: dto.canReceiveNotice ?? true,
            canSubmitHomework: dto.canSubmitHomework ?? true,
            canViewGrowth: dto.canViewGrowth ?? true,
            status: dto.status ?? "active",
            remark: dto.remark,
          },
          update: {
            relation: dto.relation,
            isPrimary:
              (dto.status ?? "active") === "active"
                ? (dto.isPrimary ?? false)
                : false,
            canReceiveNotice: dto.canReceiveNotice ?? true,
            canSubmitHomework: dto.canSubmitHomework ?? true,
            canViewGrowth: dto.canViewGrowth ?? true,
            status: dto.status ?? "active",
            remark: dto.remark,
          },
          select: this.guardianSelect(),
        });
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
        throw new ConflictException(
          "Guardian is already bound to this student",
        );
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

    const deleted = await this.prisma.studentGuardian.update({
      where: { id: guardianId },
      data: { status: "unlinked", isPrimary: false },
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

  async updateGuardian(
    actorId: string,
    studentId: string,
    guardianId: string,
    dto: UpdateGuardianDto,
  ) {
    const existing = await this.prisma.studentGuardian.findFirst({
      where: { id: guardianId, studentId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException("Guardian binding not found");
    const guardian = await this.prisma.$transaction(async (tx) => {
      const nextStatus = dto.status ?? existing.status;
      if (dto.isPrimary && nextStatus === "active") {
        await tx.studentGuardian.updateMany({
          where: { studentId, id: { not: guardianId }, status: "active" },
          data: { isPrimary: false },
        });
      }
      return tx.studentGuardian.update({
        where: { id: guardianId },
        data: {
          relation: dto.relation,
          isPrimary: nextStatus === "active" ? dto.isPrimary : false,
          canReceiveNotice: dto.canReceiveNotice,
          canSubmitHomework: dto.canSubmitHomework,
          canViewGrowth: dto.canViewGrowth,
          status: dto.status,
          remark: dto.remark,
        },
        select: this.guardianSelect(),
      });
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.guardian.update",
      targetType: "StudentGuardian",
      targetId: guardianId,
      detail: dto as Prisma.InputJsonValue,
    });
    return { data: guardian };
  }

  async listWorkflowTemplates() {
    const templates = await this.prisma.workflowTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: this.workflowTemplateSelect(),
    });

    return { data: templates };
  }

  async createWorkflowTemplate(
    actorId: string,
    dto: CreateWorkflowTemplateDto,
  ) {
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

  async workflowTemplateReferences(id: string) {
    await this.assertWorkflowTemplateExists(id);
    const sessions = await this.prisma.workflowSession.findMany({
      where: { templateId: id },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        class: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        _count: { select: { steps: true } },
      },
    });
    return { data: sessions };
  }

  async deleteWorkflowTemplate(actorId: string, id: string, force = false) {
    const current = await this.prisma.workflowTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        _count: { select: { sessions: true } },
      },
    });
    if (!current) throw new NotFoundException("Workflow template not found");
    if (force && current.isActive) {
      throw new BadRequestException("请先将模板设为停用，再清理引用并删除");
    }
    const referenceCount = current._count.sessions;
    const template = await this.deleteWithRelationCheck(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (force && referenceCount > 0) {
            await tx.workflowStep.deleteMany({
              where: { session: { templateId: id } },
            });
            await tx.workflowSession.deleteMany({ where: { templateId: id } });
          }
          await tx.workflowTemplateStep.deleteMany({
            where: { templateId: id },
          });
          return tx.workflowTemplate.delete({
            where: { id },
            select: this.workflowTemplateSelect(),
          });
        }),
      "该流程模板已被一日流程使用，不能删除；可将模板设为停用",
    );
    await this.audit.log({
      userId: actorId,
      action: "admin.workflowTemplate.delete",
      targetType: "WorkflowTemplate",
      targetId: id,
      detail: { force, deletedSessionCount: force ? referenceCount : 0 },
    });
    return { data: template };
  }

  async listHomework(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const status = this.optionalEnum(query.status, HomeworkStatus, "status");
    const where: Prisma.HomeworkAssignmentWhereInput = {
      classId: query.classId,
      teacherId: query.teacherId,
      createdAt: this.dateRange(query),
      submissions:
        query.studentId || status
          ? { some: { studentId: query.studentId, status } }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.homeworkAssignment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          class: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          submissions: {
            orderBy: { submittedAt: "desc" },
            select: {
              id: true,
              status: true,
              submittedAt: true,
              reviewedAt: true,
              remark: true,
              student: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async listTeachingRecords(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const where: Prisma.TeachingRecordWhereInput = {
      classId: query.classId,
      teacherId: query.teacherId,
      date: this.dateRange(query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teachingRecord.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take,
        include: {
          class: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      }),
      this.prisma.teachingRecord.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async listGrowthRecords(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const type = this.optionalEnum(query.type, GrowthRecordType, "type");
    const where: Prisma.GrowthRecordWhereInput = {
      studentId: query.studentId,
      teacherId: query.teacherId,
      type,
      happenedAt: this.dateRange(query),
      student: query.classId ? { classId: query.classId } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.growthRecord.findMany({
        where,
        orderBy: { happenedAt: "desc" },
        skip,
        take,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              class: { select: { id: true, name: true } },
            },
          },
          teacher: { select: { id: true, name: true } },
        },
      }),
      this.prisma.growthRecord.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async listAttendance(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const type = this.optionalEnum(query.type, AttendanceType, "type");
    const where: Prisma.AttendanceEventWhereInput = {
      studentId: query.studentId,
      teacherId: query.teacherId,
      type,
      happenedAt: this.dateRange(query),
      student: query.classId ? { classId: query.classId } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceEvent.findMany({
        where,
        orderBy: { happenedAt: "desc" },
        skip,
        take,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              class: { select: { id: true, name: true } },
            },
          },
          teacher: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendanceEvent.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async listWorkflowSessions(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const where: Prisma.WorkflowSessionWhereInput = {
      classId: query.classId,
      teacherId: query.teacherId,
      status: query.status,
      date: this.dateRange(query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflowSession.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take,
        include: {
          class: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, version: true } },
          steps: { orderBy: { sortOrder: "asc" } },
        },
      }),
      this.prisma.workflowSession.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async listLessonPlans(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const status = this.optionalEnum(
      query.status,
      LessonPlanStatus,
      "status",
    );
    const where: Prisma.LessonPlanWhereInput = {
      classId: query.classId,
      teacherId: query.teacherId,
      status,
      lessonDate: this.dateRange(query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lessonPlan.findMany({
        where,
        orderBy: { lessonDate: "desc" },
        skip,
        take,
        include: {
          class: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      }),
      this.prisma.lessonPlan.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async updateLessonPlanStatus(
    actorId: string,
    id: string,
    status: LessonPlanStatus,
  ) {
    const current = await this.prisma.lessonPlan.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException("Lesson plan not found");
    const lessonPlan = await this.prisma.lessonPlan.update({
      where: { id },
      data: { status },
      include: {
        class: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.lessonPlan.status.update",
      targetType: "LessonPlan",
      targetId: id,
      detail: { from: current.status, to: status },
    });
    return { data: lessonPlan };
  }

  async listResearchActivities(query: BusinessQueryDto) {
    const { skip, take, page, pageSize } = this.pagination(query);
    const status = this.optionalEnum(
      query.status,
      ResearchActivityStatus,
      "status",
    );
    const type = this.optionalEnum(
      query.type,
      ResearchActivityType,
      "type",
    );
    const where: Prisma.ResearchActivityWhereInput = {
      organizerId: query.teacherId,
      status,
      type,
      startAt: this.dateRange(query),
      participants: query.studentId
        ? { some: { teacherId: query.studentId } }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.researchActivity.findMany({
        where,
        orderBy: { startAt: "desc" },
        skip,
        take,
        include: {
          campus: { select: { id: true, name: true } },
          organizer: { select: { id: true, name: true } },
          participants: {
            include: { teacher: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.researchActivity.count({ where }),
    ]);
    return this.paginated(items, total, page, pageSize);
  }

  async updateResearchActivityStatus(
    actorId: string,
    id: string,
    status: ResearchActivityStatus,
  ) {
    const current = await this.prisma.researchActivity.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException("Research activity not found");
    const activity = await this.prisma.researchActivity.update({
      where: { id },
      data: { status },
      include: {
        campus: { select: { id: true, name: true } },
        organizer: { select: { id: true, name: true } },
        participants: {
          include: { teacher: { select: { id: true, name: true } } },
        },
      },
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.researchActivity.status.update",
      targetType: "ResearchActivity",
      targetId: id,
      detail: { from: current.status, to: status },
    });
    return { data: activity };
  }

  async auditLogs() {
    const logs = await this.audit.listRecent();
    return { data: logs };
  }

  private pagination(query: BusinessQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
  }

  private paginated<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    return { data: { items, total, page, pageSize } };
  }

  private dateRange(query: BusinessQueryDto) {
    if (!query.from && !query.to) return undefined;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (to && query.to?.length === 10) {
      to.setUTCHours(23, 59, 59, 999);
    }
    if (from && to && from > to) {
      throw new BadRequestException("from must be earlier than to");
    }
    return { gte: from, lte: to };
  }

  private optionalEnum<T extends Record<string, string>>(
    value: string | undefined,
    values: T,
    label: string,
  ): T[keyof T] | undefined {
    if (!value) return undefined;
    if (!Object.values(values).includes(value)) {
      throw new BadRequestException(
        `${label} must be one of: ${Object.values(values).join(", ")}`,
      );
    }
    return value as T[keyof T];
  }

  private async deleteWithRelationCheck<T>(
    operation: () => Promise<T>,
    message: string,
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  private async resolveGuardianParent(dto: BindGuardianDto) {
    if (dto.parentId) {
      return this.assertUserWithRoleExists(
        dto.parentId,
        UserRole.parent,
        "Parent",
      );
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
        throw new ConflictException(
          "Phone number is already used by another role",
        );
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
      throw new BadRequestException(
        "parentName is required when creating a parent",
      );
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
      isPrimary: true,
      canReceiveNotice: true,
      canSubmitHomework: true,
      canViewGrowth: true,
      status: true,
      remark: true,
      studentId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
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
      _count: { select: { sessions: true } },
    } satisfies Prisma.WorkflowTemplateSelect;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
