import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceType,
  PickupEventType,
  Prisma,
  StudentStatus,
  StudentWorkflowStepStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import {
  businessDateKey,
  chinaBusinessDate,
  chinaDayInstantRange,
  parseBusinessDate,
} from "../common/business-date";
import { assertOwnedFileAssetUrls } from "../files/file-asset-policy";
import { PrismaService } from "../prisma/prisma.service";

interface StudentActionInput {
  remark?: string;
  photoUrls?: string[];
}

interface BatchCompleteInput {
  studentIds?: string[];
  photoUrls?: string[];
}

export interface StudentWorkflowAdminQuery {
  page?: number;
  pageSize?: number;
  classId?: string;
  teacherId?: string;
  studentId?: string;
  status?: string;
  from?: string;
  to?: string;
}

type WorkflowClient = Pick<
  Prisma.TransactionClient,
  | "attendanceEvent"
  | "student"
  | "studentWorkflowStep"
  | "workflowStep"
  | "$executeRaw"
>;

const MAX_ADMIN_WORKFLOW_RANGE_DAYS = 31;

@Injectable()
export class StudentWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async teacherToday(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    if (classes.length === 0) return { data: [] };

    const template = await this.prisma.workflowTemplate.findFirst({
      where: { isActive: true },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) {
      throw new NotFoundException("Active workflow template not found");
    }

    const date = chinaBusinessDate();
    const sessionIds: string[] = [];
    for (const klass of classes) {
      const session = await this.prisma.workflowSession.upsert({
        where: { classId_date: { classId: klass.id, date } },
        update: { teacherId },
        create: {
          classId: klass.id,
          teacherId,
          templateId: template.id,
          date,
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
        select: { id: true },
      });
      sessionIds.push(session.id);
    }

    await this.ensureStudentRows(sessionIds, date);
    return { data: await this.teacherSessionViews(sessionIds, date) };
  }

  async completeStudent(
    teacherId: string,
    sessionId: string,
    stepId: string,
    studentId: string,
    input: StudentActionInput,
  ) {
    return this.resolveStudent(
      teacherId,
      sessionId,
      stepId,
      studentId,
      StudentWorkflowStepStatus.completed,
      input,
    );
  }

  async skipStudent(
    teacherId: string,
    sessionId: string,
    stepId: string,
    studentId: string,
    input: StudentActionInput,
  ) {
    return this.resolveStudent(
      teacherId,
      sessionId,
      stepId,
      studentId,
      StudentWorkflowStepStatus.skipped,
      input,
    );
  }

  async markStudentException(
    teacherId: string,
    sessionId: string,
    stepId: string,
    studentId: string,
    input: StudentActionInput,
  ) {
    return this.resolveStudent(
      teacherId,
      sessionId,
      stepId,
      studentId,
      StudentWorkflowStepStatus.exception,
      input,
    );
  }

  async batchComplete(
    teacherId: string,
    sessionId: string,
    stepId: string,
    input: BatchCompleteInput,
  ) {
    const context = await this.teacherStepContext(teacherId, sessionId, stepId);
    await this.ensureStudentRows([sessionId], context.date);

    const photoUrls = Array.from(new Set(input.photoUrls ?? []));
    if (context.step.requirePhoto && photoUrls.length === 0) {
      throw new BadRequestException("该流程环节需要先上传班级照片凭证");
    }
    const safePhotoUrls = await assertOwnedFileAssetUrls(this.prisma, {
      ownerId: teacherId,
      scene: "workflow",
      urls: photoUrls,
      imageOnly: true,
      invalidMessage: "流程图片无效、不属于当前教师或文件场景不是 workflow",
    });
    const requestedIds = input.studentIds
      ? Array.from(new Set(input.studentIds))
      : undefined;
    const handledAt = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockStep(transaction, stepId);
      const activeStudents = await transaction.student.findMany({
        where: {
          classId: context.classId,
          status: StudentStatus.active,
          ...(requestedIds ? { id: { in: requestedIds } } : {}),
        },
        select: { id: true },
      });
      if (requestedIds && activeStudents.length !== requestedIds.length) {
        throw new BadRequestException(
          "批量列表包含不属于当前班级或非 active 学生",
        );
      }

      const activeIds = activeStudents.map((student) => student.id);
      if (activeIds.length > 0) {
        await transaction.studentWorkflowStep.createMany({
          data: activeIds.map((studentId) => ({
            workflowStepId: stepId,
            studentId,
          })),
          skipDuplicates: true,
        });
      }
      const absences = activeIds.length
        ? await transaction.attendanceEvent.findMany({
            where: {
              studentId: { in: activeIds },
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(context.date),
            },
            select: { studentId: true },
          })
        : [];
      const absentIds = new Set(absences.map((event) => event.studentId));
      if (requestedIds && absentIds.size > 0) {
        throw new ConflictException(
          "批量列表包含今日已登记缺勤的学生，未执行任何操作",
        );
      }
      const eligibleIds = activeIds.filter((id) => !absentIds.has(id));

      const updated = eligibleIds.length
        ? await transaction.studentWorkflowStep.updateMany({
            where: {
              workflowStepId: stepId,
              studentId: { in: eligibleIds },
              status: StudentWorkflowStepStatus.pending,
            },
            data: {
              status: StudentWorkflowStepStatus.completed,
              completedAt: handledAt,
              teacherId,
              remark: null,
              photoUrls: [],
            },
          })
        : { count: 0 };

      if (updated.count === 0 && eligibleIds.length > 0) {
        throw new ConflictException("所选学生均已处理，请刷新流程");
      }

      if (safePhotoUrls.length > 0 || context.step.requirePhoto) {
        await transaction.workflowStep.update({
          where: { id: stepId },
          data: { photoUrls: safePhotoUrls },
        });
      }
      const step = await this.refreshStepCompletion(
        transaction,
        stepId,
        context.date,
      );
      await this.audit.log(
        {
          userId: teacherId,
          action: "teacher.studentWorkflow.batchComplete",
          targetType: "WorkflowStep",
          targetId: stepId,
          detail: {
            sessionId,
            requestedCount: requestedIds?.length ?? null,
            completedCount: updated.count,
            photoCount: safePhotoUrls.length,
          },
        },
        transaction,
      );
      return step;
    });

    return { data: result };
  }

  async parentToday(parentId: string, studentId: string) {
    const binding = await this.prisma.studentGuardian.findFirst({
      where: { parentId, studentId, status: "active" },
      select: {
        student: {
          select: {
            id: true,
            name: true,
            classId: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!binding) throw new NotFoundException("Student not found");

    const date = chinaBusinessDate();
    const session = await this.prisma.workflowSession.findUnique({
      where: { classId_date: { classId: binding.student.classId, date } },
      select: {
        steps: {
          orderBy: { sortOrder: "asc" },
          select: {
            stepKey: true,
            name: true,
            timeRange: true,
            sortOrder: true,
            studentSteps: {
              where: { studentId },
              select: {
                status: true,
                completedAt: true,
                photoUrls: true,
                remark: true,
                teacher: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const [absence, arrival] = await Promise.all([
      this.prisma.attendanceEvent.findFirst({
        where: {
          studentId,
          type: AttendanceType.absence,
          happenedAt: chinaDayInstantRange(date),
        },
        select: { happenedAt: true, remark: true },
      }),
      this.prisma.pickupRecord.findUnique({
        where: {
          studentId_serviceDate_type: {
            studentId,
            serviceDate: date,
            type: PickupEventType.arrived_at_center,
          },
        },
        select: {
          happenedAt: true,
          teacher: { select: { name: true } },
        },
      }),
    ]);

    const steps = (session?.steps ?? []).map((step) => {
      const record = step.studentSteps[0];
      return {
        id: `workflow:${step.stepKey}`,
        stepKey: step.stepKey,
        name: step.name,
        timeRange: step.timeRange,
        effectiveStatus: absence
          ? "absent"
          : (record?.status ?? StudentWorkflowStepStatus.pending),
        completedAt: record?.completedAt ?? null,
        photoUrls: record?.photoUrls ?? [],
        remark: record?.remark ?? null,
        teacher: record?.teacher ?? null,
      };
    });
    const arrivalItem = {
      id: `arrival:${studentId}:${businessDateKey(date)}`,
      kind: "pickup",
      stepKey: "safe_arrival",
      name: "安全到店",
      timeRange: "",
      effectiveStatus: absence ? "absent" : arrival ? "completed" : "pending",
      completedAt: arrival?.happenedAt ?? null,
      photoUrls: [] as string[],
      remark: absence?.remark ?? null,
      teacher: arrival?.teacher ?? null,
    };

    return {
      data: {
        date,
        student: { id: binding.student.id, name: binding.student.name },
        class: binding.student.class,
        isAbsent: Boolean(absence),
        summary: this.summarize([arrivalItem, ...steps]),
        timeline: [arrivalItem, ...steps],
      },
    };
  }

  async adminList(query: StudentWorkflowAdminQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const allowedStatuses = [
      ...Object.values(StudentWorkflowStepStatus),
      "absent",
    ];
    if (query.status && !allowedStatuses.includes(query.status)) {
      throw new BadRequestException(
        `status must be one of: ${allowedStatuses.join(", ")}`,
      );
    }
    const date = this.adminDateRange(query.from, query.to);
    const sessions = await this.prisma.workflowSession.findMany({
      where: {
        classId: query.classId,
        teacherId: query.teacherId,
        date,
        steps: query.studentId
          ? { some: { studentSteps: { some: { studentId: query.studentId } } } }
          : undefined,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        status: true,
        class: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        steps: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            stepKey: true,
            name: true,
            timeRange: true,
            sortOrder: true,
            studentSteps: {
              where: query.studentId ? { studentId: query.studentId } : {},
              select: {
                id: true,
                studentId: true,
                status: true,
                completedAt: true,
                photoUrls: true,
                remark: true,
                student: { select: { id: true, name: true, status: true } },
                teacher: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    const studentIds = Array.from(
      new Set(
        sessions.flatMap((session) =>
          session.steps.flatMap((step) =>
            step.studentSteps.map((record) => record.studentId),
          ),
        ),
      ),
    );
    const attendanceRange = this.attendanceRangeForSessions(sessions);
    const absences =
      studentIds.length && attendanceRange
        ? await this.prisma.attendanceEvent.findMany({
            where: {
              studentId: { in: studentIds },
              type: AttendanceType.absence,
              happenedAt: attendanceRange,
            },
            select: { studentId: true, happenedAt: true, remark: true },
          })
        : [];
    const absentKeys = new Set(
      absences.map(
        (event) =>
          `${event.studentId}:${businessDateKey(chinaBusinessDate(event.happenedAt))}`,
      ),
    );

    const items = sessions.flatMap((session) => {
      const students = new Map<
        string,
        { id: string; name: string; status: StudentStatus }
      >();
      session.steps.forEach((step) =>
        step.studentSteps.forEach((record) =>
          students.set(record.studentId, record.student),
        ),
      );
      return Array.from(students.values()).map((student) => {
        const absent = absentKeys.has(
          `${student.id}:${businessDateKey(session.date)}`,
        );
        const steps = session.steps.map((step) => {
          const record = step.studentSteps.find(
            (candidate) => candidate.studentId === student.id,
          );
          return {
            id: record?.id ?? `pending:${step.id}:${student.id}`,
            workflowStepId: step.id,
            stepKey: step.stepKey,
            name: step.name,
            timeRange: step.timeRange,
            status: record?.status ?? StudentWorkflowStepStatus.pending,
            effectiveStatus: absent
              ? "absent"
              : (record?.status ?? StudentWorkflowStepStatus.pending),
            completedAt: record?.completedAt ?? null,
            photoUrls: record?.photoUrls ?? [],
            remark: record?.remark ?? null,
            teacher: record?.teacher ?? null,
          };
        });
        return {
          id: `${session.id}:${student.id}`,
          date: session.date,
          sessionId: session.id,
          status: session.status,
          student,
          class: session.class,
          teacher: session.teacher,
          template: session.template,
          summary: this.summarize(steps),
          steps,
        };
      });
    });
    const filtered = query.status
      ? items.filter((item) =>
          item.steps.some((step) => step.effectiveStatus === query.status),
        )
      : items;
    const start = (page - 1) * pageSize;
    return {
      data: {
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
      },
    };
  }

  private async resolveStudent(
    teacherId: string,
    sessionId: string,
    stepId: string,
    studentId: string,
    status: StudentWorkflowStepStatus,
    input: StudentActionInput,
  ) {
    const context = await this.teacherStepContext(
      teacherId,
      sessionId,
      stepId,
      studentId,
    );
    await this.ensureStudentRows([sessionId], context.date);
    const remark = input.remark?.trim() || null;
    if (status !== StudentWorkflowStepStatus.completed && remark === null) {
      throw new BadRequestException("跳过或异常处理必须填写原因");
    }
    const photoUrls = await assertOwnedFileAssetUrls(this.prisma, {
      ownerId: teacherId,
      scene: "workflow",
      urls: Array.from(new Set(input.photoUrls ?? [])),
      imageOnly: true,
      invalidMessage: "个人流程图片无效、不属于当前教师或文件场景不是 workflow",
    });
    const completedAt = new Date();

    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockStep(transaction, stepId);
      await this.assertNotAbsent(transaction, studentId, context.date);
      const update = await transaction.studentWorkflowStep.updateMany({
        where: {
          workflowStepId: stepId,
          studentId,
          status: StudentWorkflowStepStatus.pending,
        },
        data: {
          status,
          completedAt,
          teacherId,
          photoUrls,
          remark,
        },
      });
      if (update.count === 0) {
        throw new ConflictException(
          "该学生该环节已经处理，如需更正请使用后续更正流程",
        );
      }
      await this.refreshStepCompletion(transaction, stepId, context.date);
      const updated = await transaction.studentWorkflowStep.findUniqueOrThrow({
        where: {
          workflowStepId_studentId: { workflowStepId: stepId, studentId },
        },
        include: {
          student: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      });
      await this.audit.log(
        {
          userId: teacherId,
          action: `teacher.studentWorkflow.${status}`,
          targetType: "StudentWorkflowStep",
          targetId: updated.id,
          detail: {
            sessionId,
            workflowStepId: stepId,
            studentId,
            photoCount: photoUrls.length,
          },
        },
        transaction,
      );
      return updated;
    });

    return { data: { ...record, effectiveStatus: record.status } };
  }

  private async teacherStepContext(
    teacherId: string,
    sessionId: string,
    stepId: string,
    studentId?: string,
  ) {
    const session = await this.prisma.workflowSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        date: true,
        class: { select: { teacherId: true } },
        steps: {
          where: { id: stepId },
          select: { id: true, requirePhoto: true },
        },
      },
    });
    if (!session || session.steps.length === 0) {
      throw new NotFoundException("Workflow step not found");
    }
    if (session.class.teacherId !== teacherId) {
      throw new ForbiddenException(
        "Cannot operate workflow for another teacher class",
      );
    }
    if (studentId) {
      const student = await this.prisma.student.findFirst({
        where: {
          id: studentId,
          classId: session.classId,
          status: StudentStatus.active,
        },
        select: { id: true },
      });
      if (!student) {
        throw new ForbiddenException(
          "Student does not belong to this active workflow class",
        );
      }
    }
    return {
      classId: session.classId,
      date: session.date,
      step: session.steps[0],
    };
  }

  private async ensureStudentRows(sessionIds: string[], date: Date) {
    if (sessionIds.length === 0) return;
    const sessions = await this.prisma.workflowSession.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        updatedAt: true,
        steps: {
          select: {
            id: true,
            checked: true,
            checkedAt: true,
            teacherId: true,
            studentSteps: { select: { id: true } },
          },
        },
      },
    });
    const classIds = sessions.map((session) => session.classId);
    const students = await this.prisma.student.findMany({
      where: { classId: { in: classIds }, status: StudentStatus.active },
      select: { id: true, classId: true },
    });
    if (students.length === 0) return;
    const absences = await this.prisma.attendanceEvent.findMany({
      where: {
        studentId: { in: students.map((student) => student.id) },
        type: AttendanceType.absence,
        happenedAt: chinaDayInstantRange(date),
      },
      select: { studentId: true },
    });
    const absentIds = new Set(absences.map((event) => event.studentId));
    const studentsByClass = new Map<string, typeof students>();
    students.forEach((student) => {
      const list = studentsByClass.get(student.classId) ?? [];
      list.push(student);
      studentsByClass.set(student.classId, list);
    });

    const rows = sessions.flatMap((session) =>
      session.steps.flatMap((step) => {
        const legacyChecked = step.checked && step.studentSteps.length === 0;
        return (studentsByClass.get(session.classId) ?? []).map((student) => {
          const completed = legacyChecked && !absentIds.has(student.id);
          return {
            workflowStepId: step.id,
            studentId: student.id,
            status: completed
              ? StudentWorkflowStepStatus.completed
              : StudentWorkflowStepStatus.pending,
            completedAt: completed
              ? (step.checkedAt ?? session.updatedAt)
              : null,
            teacherId: completed ? (step.teacherId ?? session.teacherId) : null,
          };
        });
      }),
    );
    if (rows.length > 0) {
      await this.prisma.studentWorkflowStep.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
  }

  private async teacherSessionViews(sessionIds: string[], date: Date) {
    const sessions = await this.prisma.workflowSession.findMany({
      where: { id: { in: sessionIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        templateId: true,
        date: true,
        status: true,
        class: { select: { id: true, name: true } },
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
            studentSteps: {
              where: { student: { status: StudentStatus.active } },
              orderBy: { student: { createdAt: "asc" } },
              select: {
                id: true,
                studentId: true,
                status: true,
                completedAt: true,
                photoUrls: true,
                remark: true,
                teacherId: true,
                teacher: { select: { id: true, name: true } },
                student: { select: { id: true, name: true, status: true } },
              },
            },
          },
        },
      },
    });
    const studentIds = Array.from(
      new Set(
        sessions.flatMap((session) =>
          session.steps.flatMap((step) =>
            step.studentSteps.map((record) => record.studentId),
          ),
        ),
      ),
    );
    const [absences, pickups] = studentIds.length
      ? await Promise.all([
          this.prisma.attendanceEvent.findMany({
            where: {
              studentId: { in: studentIds },
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(date),
            },
            select: { studentId: true },
          }),
          this.prisma.pickupRecord.findMany({
            where: { studentId: { in: studentIds }, serviceDate: date },
            orderBy: { happenedAt: "asc" },
            select: { studentId: true, type: true, happenedAt: true },
          }),
        ])
      : [[], []];
    const absentIds = new Set(absences.map((event) => event.studentId));
    const pickupByStudent = new Map<
      string,
      Array<{ type: PickupEventType; happenedAt: Date }>
    >();
    pickups.forEach((pickup) => {
      const list = pickupByStudent.get(pickup.studentId) ?? [];
      list.push(pickup);
      pickupByStudent.set(pickup.studentId, list);
    });
    const syncUpdates: Prisma.PrismaPromise<unknown>[] = [];

    const views = sessions.map((session) => {
      const steps = session.steps.map((step) => {
        const students = step.studentSteps.map((record) => ({
          id: record.student.id,
          name: record.student.name,
          recordId: record.id,
          status: record.status,
          effectiveStatus: absentIds.has(record.studentId)
            ? "absent"
            : record.status,
          completedAt: record.completedAt,
          photoUrls: record.photoUrls,
          remark: record.remark,
          teacher: record.teacher,
          pickupStatus: this.pickupStatus(
            pickupByStudent.get(record.studentId) ?? [],
            absentIds.has(record.studentId),
          ),
          pickupArrivedAt:
            pickupByStudent
              .get(record.studentId)
              ?.find((item) => item.type === PickupEventType.arrived_at_center)
              ?.happenedAt ?? null,
        }));
        const summary = this.summarize(students);
        const checked = summary.pending === 0;
        const last = step.studentSteps
          .filter(
            (record) =>
              !absentIds.has(record.studentId) &&
              record.status !== StudentWorkflowStepStatus.pending,
          )
          .sort(
            (left, right) =>
              Number(right.completedAt ?? 0) - Number(left.completedAt ?? 0),
          )[0];
        const checkedAt = checked ? (last?.completedAt ?? null) : null;
        if (
          step.checked !== checked ||
          Number(step.checkedAt ?? 0) !== Number(checkedAt ?? 0)
        ) {
          syncUpdates.push(
            this.prisma.workflowStep.updateMany({
              where: {
                id: step.id,
                checked: step.checked,
                checkedAt: step.checkedAt,
              },
              data: {
                checked,
                checkedAt,
                teacherId: checked ? (last?.teacherId ?? null) : null,
              },
            }),
          );
        }
        return {
          ...step,
          checked,
          checkedAt,
          studentSummary: summary,
          students,
        };
      });
      return {
        ...session,
        steps,
        studentSummary: this.summarize(steps.flatMap((step) => step.students)),
      };
    });
    if (syncUpdates.length > 0) await this.prisma.$transaction(syncUpdates);
    return views;
  }

  private async refreshStepCompletion(
    transaction: WorkflowClient,
    stepId: string,
    date: Date,
  ) {
    const step = await transaction.workflowStep.findUnique({
      where: { id: stepId },
      select: {
        id: true,
        session: { select: { classId: true } },
      },
    });
    if (!step) throw new NotFoundException("Workflow step not found");
    const students = await transaction.student.findMany({
      where: {
        classId: step.session.classId,
        status: StudentStatus.active,
      },
      select: { id: true },
    });
    const studentIds = students.map((student) => student.id);
    const [absences, records] = studentIds.length
      ? await Promise.all([
          transaction.attendanceEvent.findMany({
            where: {
              studentId: { in: studentIds },
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(date),
            },
            select: { studentId: true },
          }),
          transaction.studentWorkflowStep.findMany({
            where: { workflowStepId: stepId, studentId: { in: studentIds } },
            select: {
              studentId: true,
              status: true,
              completedAt: true,
              teacherId: true,
            },
          }),
        ])
      : [[], []];
    const absentIds = new Set(absences.map((event) => event.studentId));
    const eligibleIds = studentIds.filter((id) => !absentIds.has(id));
    const recordByStudent = new Map(
      records.map((record) => [record.studentId, record]),
    );
    const hasPending = eligibleIds.some(
      (id) =>
        !recordByStudent.has(id) ||
        recordByStudent.get(id)?.status === StudentWorkflowStepStatus.pending,
    );
    const last = records
      .filter(
        (record) =>
          eligibleIds.includes(record.studentId) &&
          record.status !== StudentWorkflowStepStatus.pending,
      )
      .sort(
        (left, right) =>
          Number(right.completedAt ?? 0) - Number(left.completedAt ?? 0),
      )[0];
    return transaction.workflowStep.update({
      where: { id: stepId },
      data: {
        checked: !hasPending,
        checkedAt: hasPending ? null : (last?.completedAt ?? null),
        teacherId: hasPending ? null : (last?.teacherId ?? null),
      },
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
  }

  private async assertNotAbsent(
    client: Pick<Prisma.TransactionClient, "attendanceEvent">,
    studentId: string,
    date: Date,
  ) {
    const absence = await client.attendanceEvent.findFirst({
      where: {
        studentId,
        type: AttendanceType.absence,
        happenedAt: chinaDayInstantRange(date),
      },
      select: { id: true },
    });
    if (absence) {
      throw new ConflictException("该学生今天已登记缺勤，不能执行托管流程");
    }
  }

  private async lockStep(client: WorkflowClient, stepId: string) {
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`student-workflow:${stepId}`}, 0))
    `;
  }

  private summarize(
    items: Array<{ effectiveStatus: string }>,
  ): Record<string, number> & { total: number } {
    const summary = {
      total: items.length,
      pending: 0,
      completed: 0,
      skipped: 0,
      exception: 0,
      absent: 0,
    };
    items.forEach((item) => {
      const key = item.effectiveStatus as keyof typeof summary;
      if (key !== "total" && key in summary) summary[key] += 1;
    });
    return summary;
  }

  private pickupStatus(
    records: Array<{ type: PickupEventType }>,
    absent: boolean,
  ) {
    const types = new Set(records.map((record) => record.type));
    if (types.has(PickupEventType.left_center)) return "left";
    if (types.has(PickupEventType.arrived_at_center)) return "in_care";
    if (types.has(PickupEventType.picked_up_from_school)) return "picked_up";
    return absent ? "absent" : "waiting_pickup";
  }

  private adminDateRange(from?: string, to?: string) {
    if (!from && !to) {
      const today = chinaBusinessDate();
      return { gte: today, lte: today };
    }
    const parsedStart = from ? parseBusinessDate(from.slice(0, 10)) : null;
    const parsedEnd = to ? parseBusinessDate(to.slice(0, 10)) : null;
    if ((from && !parsedStart) || (to && !parsedEnd)) {
      throw new BadRequestException("日期必须使用 YYYY-MM-DD 格式");
    }
    const start = parsedStart ?? parsedEnd;
    const end = parsedEnd ?? parsedStart;
    if (!start || !end) {
      throw new BadRequestException("日期范围无效");
    }
    if (start && end && start > end) {
      throw new BadRequestException("开始日期不能晚于结束日期");
    }
    const rangeDays =
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (rangeDays > MAX_ADMIN_WORKFLOW_RANGE_DAYS) {
      throw new BadRequestException(
        `学生托管流程单次查询最多 ${MAX_ADMIN_WORKFLOW_RANGE_DAYS} 天`,
      );
    }
    return { gte: start, lte: end };
  }

  private attendanceRangeForSessions(
    sessions: Array<{ date: Date }>,
  ): { gte: Date; lt: Date } | undefined {
    if (sessions.length === 0) return undefined;
    const dates = sessions.map((session) => session.date.getTime());
    const first = new Date(Math.min(...dates));
    const last = new Date(Math.max(...dates));
    const start = chinaDayInstantRange(first).gte;
    const end = chinaDayInstantRange(last).lt;
    return { gte: start, lt: end };
  }
}
