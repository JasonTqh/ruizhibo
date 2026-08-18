import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceType,
  HomeworkStatus,
  PickupEventType,
  PickupHandoffStatus,
  Prisma,
  StudentCareRecordType,
  StudentWorkflowStepStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import {
  businessDateKey,
  chinaBusinessDate,
  chinaDayInstantRange,
  parseBusinessDate,
} from "../common/business-date";
import { PrismaService } from "../prisma/prisma.service";
import {
  AdminDailyReportQueryDto,
  DailyReportDateQueryDto,
  TeacherDailyReportQueryDto,
  UpdateDailyReportNoteDto,
} from "./dto/daily-report.dto";

type ReportStatus =
  "absence" | "waiting_pickup" | "picked_up" | "in_care" | "left";

type ReportAudience = "parent" | "teacher" | "admin";

interface StudentCandidate {
  id: string;
  name: string;
  class: {
    id: string;
    name: string;
    campus: { id: string; name: string };
  };
}

interface ReportDateContext {
  date: Date;
  key: string;
  instantRange: { gte: Date; lt: Date };
}

interface AttendanceFact {
  studentId: string;
  type: AttendanceType;
  happenedAt: Date;
  remark: string | null;
  teacher: { name: string } | null;
}

interface PickupFact {
  studentId: string;
  type: PickupEventType;
  happenedAt: Date;
  arrivalMethod: string | null;
  pickupPersonNameSnapshot?: string | null;
  relationshipSnapshot?: string | null;
  status: PickupHandoffStatus;
  isException: boolean;
  exceptionReason?: string | null;
  resolution?: string | null;
  remark?: string | null;
  teacher?: { name: string };
}

interface WorkflowFact {
  stepKey: string;
  name?: string;
  timeRange?: string;
  sortOrder: number;
  session: { classId: string };
  studentSteps: Array<{
    studentId: string;
    status: StudentWorkflowStepStatus;
    completedAt: Date | null;
    remark?: string | null;
    photoUrls?: string[];
    teacher?: { name: string } | null;
  }>;
}

interface CareFact {
  studentId: string;
  type: StudentCareRecordType;
  mealSlot: string | null;
  value: string | null;
  quantity: number | null;
  durationMinutes: number | null;
  exceptionCategory: string | null;
  happenedAt: Date;
  needsAttention: boolean;
  remark?: string | null;
  resolution?: string | null;
  photoUrls?: string[];
  teacher?: { name: string } | null;
}

interface HomeworkFact {
  classId: string;
  title?: string;
  subject?: string;
  content?: string;
  dueAt: Date | null;
  createdAt: Date;
  teacher?: { name: string };
  submissions: Array<{
    studentId: string;
    status: HomeworkStatus;
    content?: string | null;
    fileUrls?: string[];
    submittedAt: Date | null;
    reviewedAt: Date | null;
    remark?: string | null;
  }>;
}

interface GrowthFact {
  studentId: string;
  type: string;
  title: string;
  content: string;
  happenedAt: Date;
  teacher: { name: string } | null;
}

interface NoteFact {
  studentId: string;
  comment?: string | null;
  publishedAt: Date | null;
  updatedAt?: Date;
  teacher?: { name: string } | null;
}

interface ReportFacts {
  attendance: AttendanceFact[];
  pickups: PickupFact[];
  workflow: WorkflowFact[];
  care: CareFact[];
  homework: HomeworkFact[];
  growth: GrowthFact[];
  notes: NoteFact[];
}

interface AttentionItem {
  source: "pickup" | "care" | "workflow" | "homework";
  level: "high" | "medium" | "low";
  label: string;
  happenedAt: Date | null;
}

const studentCandidateSelect = Prisma.validator<Prisma.StudentSelect>()({
  id: true,
  name: true,
  class: {
    select: {
      id: true,
      name: true,
      campus: { select: { id: true, name: true } },
    },
  },
});

const statusLabels: Record<ReportStatus, string> = {
  absence: "今日请假 / 缺勤",
  waiting_pickup: "待接",
  picked_up: "已接到，前往托管中心",
  in_care: "已安全到店 / 托管中",
  left: "已安全离店",
};

@Injectable()
export class DailyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async parentReport(
    parentId: string,
    studentId: string,
    query: DailyReportDateQueryDto,
  ) {
    const date = this.reportDate(query.date, 90);
    const binding = await this.prisma.studentGuardian.findFirst({
      where: { parentId, studentId, status: "active" },
      select: {
        canViewGrowth: true,
        student: { select: studentCandidateSelect },
      },
    });
    if (!binding) throw new NotFoundException("Student not found");

    const reports = await this.aggregate(
      [binding.student],
      date,
      "parent",
      true,
      binding.canViewGrowth,
    );
    return { data: reports[0] };
  }

  async teacherReports(teacherId: string, query: TeacherDailyReportQueryDto) {
    const date = this.reportDate(query.date, 31);
    if (query.classId) {
      const ownedClass = await this.prisma.class.findFirst({
        where: { id: query.classId, teacherId },
        select: { id: true },
      });
      if (!ownedClass) throw new NotFoundException("Class not found");
    }

    const students = await this.prisma.student.findMany({
      where: {
        status: "active",
        class: { teacherId },
        ...(query.classId ? { classId: query.classId } : {}),
      },
      orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
      select: studentCandidateSelect,
    });
    const reports = await this.aggregate(students, date, "teacher", false);
    const data = reports.filter((report) => {
      if (query.status && report.status !== query.status) return false;
      if (
        query.needsAttention !== undefined &&
        report.attention.needsAttentionCount > 0 !== query.needsAttention
      ) {
        return false;
      }
      return true;
    });
    return { data: { date: date.key, items: data } };
  }

  async teacherReport(
    teacherId: string,
    studentId: string,
    query: DailyReportDateQueryDto,
  ) {
    const date = this.reportDate(query.date, 31);
    const student = await this.teacherStudent(teacherId, studentId);
    const reports = await this.aggregate([student], date, "teacher", true);
    return { data: reports[0] };
  }

  async adminReports(query: AdminDailyReportQueryDto) {
    const date = this.reportDate(query.date);
    const where: Prisma.StudentWhereInput = {
      ...(query.studentId ? { id: query.studentId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.campusId || query.teacherId
        ? {
            class: {
              ...(query.campusId ? { campusId: query.campusId } : {}),
              ...(query.teacherId ? { teacherId: query.teacherId } : {}),
            },
          }
        : {}),
      ...this.adminStatusWhere(query.status, date),
      ...this.adminAttentionWhere(query, date),
      ...(query.published === undefined
        ? {}
        : query.published
          ? {
              dailyReportNotes: {
                some: { serviceDate: date.date, publishedAt: { not: null } },
              },
            }
          : {
              dailyReportNotes: {
                none: { serviceDate: date.date, publishedAt: { not: null } },
              },
            }),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
        skip,
        take: query.pageSize,
        select: studentCandidateSelect,
      }),
    ]);
    const data = await this.aggregate(students, date, "admin", false);
    return {
      data: {
        date: date.key,
        items: data,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async adminReport(studentId: string, query: DailyReportDateQueryDto) {
    const date = this.reportDate(query.date);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: studentCandidateSelect,
    });
    if (!student) throw new NotFoundException("Student not found");
    const reports = await this.aggregate([student], date, "admin", true);
    return { data: reports[0] };
  }

  async saveTeacherNote(
    teacherId: string,
    studentId: string,
    dto: UpdateDailyReportNoteDto,
  ) {
    const date = this.reportDate(dto.date, 0);
    const comment = dto.comment.trim();
    if (dto.publish && !comment) {
      throw new BadRequestException("Published note cannot be empty");
    }

    const note = await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: studentId, status: "active", class: { teacherId } },
        select: { id: true },
      });
      if (!student) throw new NotFoundException("Student not found");

      const existing = await tx.studentDailyReportNote.findUnique({
        where: {
          studentId_serviceDate: { studentId, serviceDate: date.date },
        },
        select: { publishedAt: true },
      });
      const saved = await tx.studentDailyReportNote.upsert({
        where: {
          studentId_serviceDate: { studentId, serviceDate: date.date },
        },
        create: {
          studentId,
          serviceDate: date.date,
          teacherId,
          comment: comment || null,
          publishedAt: dto.publish ? new Date() : null,
        },
        update: {
          teacherId,
          comment: comment || null,
          publishedAt: dto.publish ? new Date() : null,
        },
        select: {
          comment: true,
          publishedAt: true,
          updatedAt: true,
          teacher: { select: { name: true } },
        },
      });
      const action = dto.publish
        ? "teacher.dailyReport.note.publish"
        : existing?.publishedAt
          ? "teacher.dailyReport.note.unpublish"
          : "teacher.dailyReport.note.save";
      await this.audit.log(
        {
          userId: teacherId,
          action,
          targetType: "StudentDailyReportNote",
          targetId: studentId,
          detail: {
            studentId,
            date: date.key,
            published: dto.publish,
            hasComment: Boolean(comment),
          },
        },
        tx,
      );
      return saved;
    });

    return {
      data: {
        comment: note.comment,
        publishedAt: note.publishedAt,
        updatedAt: note.updatedAt,
        isPublished: Boolean(note.publishedAt),
        teacher: note.teacher,
      },
    };
  }

  private reportDate(value?: string, maxPastDays?: number): ReportDateContext {
    const today = chinaBusinessDate();
    const date = value ? parseBusinessDate(value) : today;
    if (!date) throw new BadRequestException("Invalid report date");
    const dayDifference = Math.round(
      (today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (dayDifference < 0) {
      throw new BadRequestException("Future report dates are not allowed");
    }
    if (maxPastDays !== undefined && dayDifference > maxPastDays) {
      throw new BadRequestException(
        `Report date must be within the last ${maxPastDays} days`,
      );
    }
    return {
      date,
      key: businessDateKey(date),
      instantRange: chinaDayInstantRange(date),
    };
  }

  private async teacherStudent(teacherId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, status: "active", class: { teacherId } },
      select: studentCandidateSelect,
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  private adminStatusWhere(
    status: TeacherDailyReportQueryDto["status"],
    date: ReportDateContext,
  ): Prisma.StudentWhereInput {
    if (!status) return {};
    const absence: Prisma.StudentWhereInput = {
      attendance: {
        some: { type: "absence", happenedAt: date.instantRange },
      },
    };
    const noAbsence: Prisma.StudentWhereInput = { NOT: absence };
    const hasPickup = (type: PickupEventType): Prisma.StudentWhereInput => ({
      OR: [
        { pickupRecords: { some: { serviceDate: date.date, type } } },
        ...(type === "arrived_at_center"
          ? [
              {
                attendance: {
                  some: {
                    type: "arrive" as const,
                    happenedAt: date.instantRange,
                  },
                },
              },
            ]
          : type === "left_center"
            ? [
                {
                  attendance: {
                    some: {
                      type: "leave" as const,
                      happenedAt: date.instantRange,
                    },
                  },
                },
              ]
            : []),
      ],
    });
    if (status === "absence") return absence;
    if (status === "left")
      return { AND: [noAbsence, hasPickup("left_center")] };
    if (status === "in_care") {
      return {
        AND: [
          noAbsence,
          hasPickup("arrived_at_center"),
          { NOT: hasPickup("left_center") },
        ],
      };
    }
    if (status === "picked_up") {
      return {
        AND: [
          noAbsence,
          hasPickup("picked_up_from_school"),
          { NOT: hasPickup("arrived_at_center") },
          { NOT: hasPickup("left_center") },
        ],
      };
    }
    return {
      AND: [
        noAbsence,
        { NOT: hasPickup("picked_up_from_school") },
        { NOT: hasPickup("arrived_at_center") },
        { NOT: hasPickup("left_center") },
      ],
    };
  }

  private adminAttentionWhere(
    query: AdminDailyReportQueryDto,
    date: ReportDateContext,
  ): Prisma.StudentWhereInput {
    if (
      query.hasException === undefined &&
      query.needsAttention === undefined
    ) {
      return {};
    }
    const exceptionConditions: Prisma.StudentWhereInput[] = [
      {
        pickupRecords: {
          some: {
            serviceDate: date.date,
            OR: [
              { isException: true },
              { status: { not: PickupHandoffStatus.normal } },
            ],
          },
        },
      },
      {
        careRecords: {
          some: {
            serviceDate: date.date,
            type: StudentCareRecordType.exception,
          },
        },
      },
      {
        workflowSteps: {
          some: {
            status: StudentWorkflowStepStatus.exception,
            workflowStep: { session: { date: date.date } },
          },
        },
      },
    ];
    const attentionConditions: Prisma.StudentWhereInput[] = [
      ...exceptionConditions,
      {
        careRecords: {
          some: { serviceDate: date.date, needsAttention: true },
        },
      },
      {
        submissions: {
          some: {
            status: HomeworkStatus.overdue,
            homework: {
              OR: [
                { dueAt: date.instantRange },
                { dueAt: null, createdAt: date.instantRange },
              ],
            },
          },
        },
      },
    ];
    const filters: Prisma.StudentWhereInput[] = [];
    const noAbsence: Prisma.StudentWhereInput = {
      NOT: {
        attendance: {
          some: { type: "absence", happenedAt: date.instantRange },
        },
      },
    };
    if (query.hasException !== undefined) {
      filters.push(
        query.hasException
          ? { AND: [noAbsence, { OR: exceptionConditions }] }
          : { OR: [{ NOT: { OR: exceptionConditions } }, { NOT: noAbsence }] },
      );
    }
    if (query.needsAttention !== undefined) {
      filters.push(
        query.needsAttention
          ? { AND: [noAbsence, { OR: attentionConditions }] }
          : { OR: [{ NOT: { OR: attentionConditions } }, { NOT: noAbsence }] },
      );
    }
    return { AND: filters };
  }

  private async aggregate(
    students: StudentCandidate[],
    date: ReportDateContext,
    audience: ReportAudience,
    detail: boolean,
    includeGrowth = true,
  ) {
    if (students.length === 0) return [];
    const facts = await this.loadFacts(students, date, detail, includeGrowth);
    return students.map((student) =>
      this.buildReport(student, facts, date, audience, detail),
    );
  }

  private async loadFacts(
    students: StudentCandidate[],
    date: ReportDateContext,
    detail: boolean,
    includeGrowth: boolean,
  ): Promise<ReportFacts> {
    const studentIds = students.map((student) => student.id);
    const classIds = [...new Set(students.map((student) => student.class.id))];
    const [attendance, pickups, workflow, care, homework, growth, notes] =
      await Promise.all([
        this.prisma.attendanceEvent.findMany({
          where: {
            studentId: { in: studentIds },
            happenedAt: date.instantRange,
            type: { in: ["arrive", "leave", "absence"] },
          },
          orderBy: { happenedAt: "asc" },
          select: {
            studentId: true,
            type: true,
            happenedAt: true,
            remark: true,
            teacher: { select: { name: true } },
          },
        }),
        this.loadPickupFacts(studentIds, date, detail),
        this.loadWorkflowFacts(classIds, studentIds, date, detail),
        this.loadCareFacts(studentIds, date, detail),
        this.loadHomeworkFacts(classIds, studentIds, date, detail),
        detail && includeGrowth
          ? this.prisma.growthRecord.findMany({
              where: {
                studentId: { in: studentIds },
                visibleToParent: true,
                happenedAt: date.instantRange,
              },
              orderBy: { happenedAt: "asc" },
              select: {
                studentId: true,
                type: true,
                title: true,
                content: true,
                happenedAt: true,
                teacher: { select: { name: true } },
              },
            })
          : Promise.resolve([] as GrowthFact[]),
        this.prisma.studentDailyReportNote.findMany({
          where: { studentId: { in: studentIds }, serviceDate: date.date },
          select: {
            studentId: true,
            publishedAt: true,
            ...(detail
              ? {
                  comment: true,
                  updatedAt: true,
                  teacher: { select: { name: true } },
                }
              : {}),
          },
        }),
      ]);
    return { attendance, pickups, workflow, care, homework, growth, notes };
  }

  private async loadPickupFacts(
    studentIds: string[],
    date: ReportDateContext,
    detail: boolean,
  ): Promise<PickupFact[]> {
    return this.prisma.pickupRecord.findMany({
      where: { studentId: { in: studentIds }, serviceDate: date.date },
      orderBy: { happenedAt: "asc" },
      select: {
        studentId: true,
        type: true,
        happenedAt: true,
        arrivalMethod: true,
        status: true,
        isException: true,
        ...(detail
          ? {
              pickupPersonNameSnapshot: true,
              relationshipSnapshot: true,
              exceptionReason: true,
              resolution: true,
              remark: true,
              teacher: { select: { name: true } },
            }
          : {}),
      },
    });
  }

  private async loadWorkflowFacts(
    classIds: string[],
    studentIds: string[],
    date: ReportDateContext,
    detail: boolean,
  ): Promise<WorkflowFact[]> {
    const studentStepSelect = {
      studentId: true,
      status: true,
      completedAt: true,
      ...(detail
        ? {
            remark: true,
            photoUrls: true,
            teacher: { select: { name: true } },
          }
        : {}),
    } satisfies Prisma.StudentWorkflowStepSelect;
    return this.prisma.workflowStep.findMany({
      where: { session: { classId: { in: classIds }, date: date.date } },
      orderBy: { sortOrder: "asc" },
      select: {
        stepKey: true,
        sortOrder: true,
        ...(detail ? { name: true, timeRange: true } : {}),
        session: { select: { classId: true } },
        studentSteps: {
          where: { studentId: { in: studentIds } },
          select: studentStepSelect,
        },
      },
    });
  }

  private async loadCareFacts(
    studentIds: string[],
    date: ReportDateContext,
    detail: boolean,
  ): Promise<CareFact[]> {
    return this.prisma.studentCareRecord.findMany({
      where: { studentId: { in: studentIds }, serviceDate: date.date },
      orderBy: { happenedAt: "asc" },
      select: {
        studentId: true,
        type: true,
        mealSlot: true,
        value: true,
        quantity: true,
        durationMinutes: true,
        exceptionCategory: true,
        happenedAt: true,
        needsAttention: true,
        ...(detail
          ? {
              remark: true,
              resolution: true,
              photoUrls: true,
              teacher: { select: { name: true } },
            }
          : {}),
      },
    });
  }

  private async loadHomeworkFacts(
    classIds: string[],
    studentIds: string[],
    date: ReportDateContext,
    detail: boolean,
  ): Promise<HomeworkFact[]> {
    return this.prisma.homeworkAssignment.findMany({
      where: {
        classId: { in: classIds },
        OR: [
          { dueAt: date.instantRange },
          { dueAt: null, createdAt: date.instantRange },
          {
            submissions: {
              some: {
                studentId: { in: studentIds },
                OR: [
                  { submittedAt: date.instantRange },
                  { reviewedAt: date.instantRange },
                ],
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        classId: true,
        dueAt: true,
        createdAt: true,
        ...(detail
          ? {
              title: true,
              subject: true,
              content: true,
              teacher: { select: { name: true } },
            }
          : {}),
        submissions: {
          where: { studentId: { in: studentIds } },
          select: {
            studentId: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
            ...(detail ? { content: true, fileUrls: true, remark: true } : {}),
          },
        },
      },
    });
  }

  private buildReport(
    student: StudentCandidate,
    facts: ReportFacts,
    date: ReportDateContext,
    audience: ReportAudience,
    detail: boolean,
  ) {
    const attendance = facts.attendance.filter(
      (record) => record.studentId === student.id,
    );
    const pickups = facts.pickups.filter(
      (record) => record.studentId === student.id,
    );
    const care = facts.care.filter((record) => record.studentId === student.id);
    const workflow = facts.workflow.filter(
      (record) => record.session.classId === student.class.id,
    );
    const homework = facts.homework.filter((record) =>
      this.homeworkBelongsToDate(record, student, date),
    );
    const growth = facts.growth.filter(
      (record) => record.studentId === student.id,
    );
    const note = facts.notes.find((record) => record.studentId === student.id);
    const absence = [...attendance]
      .reverse()
      .find((record) => record.type === "absence");
    const status = this.deriveStatus(attendance, pickups);
    const isAbsent = status === "absence";
    const workflowReport = this.workflowReport(
      student.id,
      workflow,
      detail,
      isAbsent,
    );
    const careReport = this.careReport(care, detail, isAbsent);
    const homeworkReport = this.homeworkReport(
      homework,
      student.id,
      detail,
      isAbsent,
    );
    const attentionItems = isAbsent
      ? []
      : this.attentionItems(
          pickups,
          care,
          workflowReport.detailSteps,
          homeworkReport.detailItems,
        );
    const needsAttentionCount = attentionItems.filter(
      (item) => item.level === "high",
    ).length;
    const noteResponse = this.noteResponse(note, audience);

    const base = {
      ...(audience === "parent" ? {} : { id: student.id }),
      date: date.key,
      generatedAt: new Date(),
      student: { id: student.id, name: student.name },
      class:
        audience === "parent"
          ? { name: student.class.name }
          : { id: student.class.id, name: student.class.name },
      campus:
        audience === "admin"
          ? { id: student.class.campus.id, name: student.class.campus.name }
          : { name: student.class.campus.name },
      status,
      statusLabel: statusLabels[status],
      isAbsent,
      absence: absence
        ? {
            happenedAt: absence.happenedAt,
            remark: absence.remark,
            teacher: absence.teacher,
          }
        : null,
      attention: {
        count: attentionItems.length,
        needsAttentionCount,
        ...(detail ? { items: attentionItems } : {}),
      },
      pickup: this.pickupReport(attendance, pickups, status, detail, isAbsent),
      workflow: workflowReport.response,
      care: careReport.response,
      homework: homeworkReport.response,
      ...(detail
        ? { teacherNote: noteResponse }
        : { notePublished: Boolean(note?.publishedAt) }),
    };

    if (!detail) return base;
    return {
      ...base,
      growth: isAbsent
        ? { available: false, items: [] }
        : {
            available: true,
            items: growth.map((record) => ({
              type: record.type,
              title: record.title,
              content: record.content,
              happenedAt: record.happenedAt,
              teacher: record.teacher,
            })),
          },
    };
  }

  private deriveStatus(
    attendance: AttendanceFact[],
    pickups: PickupFact[],
  ): ReportStatus {
    if (attendance.some((record) => record.type === "absence"))
      return "absence";
    if (
      pickups.some((record) => record.type === "left_center") ||
      attendance.some((record) => record.type === "leave")
    ) {
      return "left";
    }
    if (
      pickups.some((record) => record.type === "arrived_at_center") ||
      attendance.some((record) => record.type === "arrive")
    ) {
      return "in_care";
    }
    if (pickups.some((record) => record.type === "picked_up_from_school")) {
      return "picked_up";
    }
    return "waiting_pickup";
  }

  private pickupReport(
    attendance: AttendanceFact[],
    pickups: PickupFact[],
    status: ReportStatus,
    detail: boolean,
    isAbsent: boolean,
  ) {
    if (isAbsent) return { available: false, status, events: [] };
    if (!detail) {
      return {
        available: pickups.length > 0 || attendance.length > 0,
        status,
        attentionCount: pickups.filter(
          (record) => record.isException || record.status !== "normal",
        ).length,
      };
    }
    const events = pickups.map((record) => ({
      type: record.type,
      happenedAt: record.happenedAt,
      arrivalMethod: record.arrivalMethod,
      pickupPersonName: record.pickupPersonNameSnapshot,
      relationship: record.relationshipSnapshot,
      status: record.status,
      isException: record.isException,
      exceptionReason: record.exceptionReason,
      resolution: record.resolution,
      remark: record.remark,
      teacher: record.teacher,
    }));
    if (!pickups.some((record) => record.type === "arrived_at_center")) {
      for (const record of attendance.filter(({ type }) => type === "arrive")) {
        events.push({
          type: PickupEventType.arrived_at_center,
          happenedAt: record.happenedAt,
          arrivalMethod: null,
          pickupPersonName: null,
          relationship: null,
          status: PickupHandoffStatus.normal,
          isException: false,
          exceptionReason: null,
          resolution: null,
          remark: record.remark,
          teacher: record.teacher ?? { name: "" },
        });
      }
    }
    if (!pickups.some((record) => record.type === "left_center")) {
      for (const record of attendance.filter(({ type }) => type === "leave")) {
        events.push({
          type: PickupEventType.left_center,
          happenedAt: record.happenedAt,
          arrivalMethod: null,
          pickupPersonName: null,
          relationship: null,
          status: PickupHandoffStatus.normal,
          isException: false,
          exceptionReason: null,
          resolution: null,
          remark: record.remark,
          teacher: record.teacher ?? { name: "" },
        });
      }
    }
    events.sort(
      (left, right) => left.happenedAt.getTime() - right.happenedAt.getTime(),
    );
    return { available: events.length > 0, status, events };
  }

  private workflowReport(
    studentId: string,
    facts: WorkflowFact[],
    detail: boolean,
    isAbsent: boolean,
  ) {
    if (isAbsent) {
      return {
        response: {
          available: false,
          summary: null,
          ...(detail ? { steps: [] } : {}),
        },
        detailSteps: [] as Array<{
          status: StudentWorkflowStepStatus;
          completedAt: Date | null;
        }>,
      };
    }
    const steps = facts.map((fact) => {
      const personal = fact.studentSteps.find(
        (step) => step.studentId === studentId,
      );
      return {
        stepKey: fact.stepKey,
        name: fact.name,
        timeRange: fact.timeRange,
        sortOrder: fact.sortOrder,
        status: personal?.status ?? StudentWorkflowStepStatus.pending,
        completedAt: personal?.completedAt ?? null,
        remark: personal?.remark ?? null,
        photoUrls: personal?.photoUrls ?? [],
        teacher: personal?.teacher ?? null,
      };
    });
    const counts = {
      total: steps.length,
      completed: steps.filter(({ status }) => status === "completed").length,
      skipped: steps.filter(({ status }) => status === "skipped").length,
      exception: steps.filter(({ status }) => status === "exception").length,
      pending: steps.filter(({ status }) => status === "pending").length,
      processed: steps.filter(({ status }) => status !== "pending").length,
    };
    return {
      response: {
        available: steps.length > 0,
        summary: steps.length > 0 ? counts : null,
        ...(detail
          ? {
              steps: steps.map(({ sortOrder: _sortOrder, ...step }) => step),
            }
          : {}),
      },
      detailSteps: steps,
    };
  }

  private careReport(facts: CareFact[], detail: boolean, isAbsent: boolean) {
    if (isAbsent) {
      return {
        response: detail
          ? {
              available: false,
              meal: { snack: null, dinner: null },
              water: { hasRecord: false, count: null },
              rest: null,
              mood: null,
              exceptions: [],
            }
          : { available: false, summary: null },
      };
    }
    const latest = (records: CareFact[]) => records.at(-1) ?? null;
    const mealValue = (slot: "snack" | "dinner") =>
      latest(
        facts.filter(
          (record) => record.type === "meal" && record.mealSlot === slot,
        ),
      );
    const water = facts.filter((record) => record.type === "water");
    const rest = latest(facts.filter((record) => record.type === "rest"));
    const mood = latest(facts.filter((record) => record.type === "mood"));
    const exceptions = facts.filter((record) => record.type === "exception");
    if (!detail) {
      return {
        response: {
          available: facts.length > 0,
          summary: {
            meal: {
              snack: mealValue("snack")?.value ?? null,
              dinner: mealValue("dinner")?.value ?? null,
            },
            water: {
              hasRecord: water.length > 0,
              count:
                water.length > 0
                  ? water.reduce(
                      (sum, record) => sum + (record.quantity ?? 0),
                      0,
                    )
                  : null,
            },
            rest: rest?.value ?? null,
            mood: mood?.value ?? null,
            exceptionCount: exceptions.length,
            needsAttentionCount: facts.filter((record) => record.needsAttention)
              .length,
          },
        },
      };
    }
    const compactRecord = (record: CareFact | null) =>
      record
        ? {
            value: record.value,
            durationMinutes: record.durationMinutes,
            happenedAt: record.happenedAt,
            remark: record.remark,
            teacher: record.teacher,
          }
        : null;
    return {
      response: {
        available: facts.length > 0,
        meal: {
          snack: compactRecord(mealValue("snack")),
          dinner: compactRecord(mealValue("dinner")),
        },
        water: {
          hasRecord: water.length > 0,
          count:
            water.length > 0
              ? water.reduce((sum, record) => sum + (record.quantity ?? 0), 0)
              : null,
        },
        rest: compactRecord(rest),
        mood: compactRecord(mood),
        exceptionCount: exceptions.length,
        needsAttentionCount: facts.filter((record) => record.needsAttention)
          .length,
        ...(detail
          ? {
              exceptions: exceptions.map((record) => ({
                happenedAt: record.happenedAt,
                category: record.exceptionCategory,
                remark: record.remark,
                resolution: record.resolution,
                needsAttention: record.needsAttention,
                photoUrls: record.photoUrls ?? [],
                teacher: record.teacher,
              })),
            }
          : {}),
      },
    };
  }

  private homeworkReport(
    facts: HomeworkFact[],
    studentId: string,
    detail: boolean,
    isAbsent: boolean,
  ) {
    if (isAbsent) {
      return {
        response: {
          available: false,
          summary: null,
          ...(detail ? { items: [] } : {}),
        },
        detailItems: [] as Array<{
          status: HomeworkStatus;
          submittedAt: Date | null;
        }>,
      };
    }
    const items = facts.map((assignment) => {
      const submission = assignment.submissions.find(
        (record) => record.studentId === studentId,
      );
      return {
        title: assignment.title ?? "作业",
        subject: assignment.subject ?? "",
        content: assignment.content ?? "",
        dueAt: assignment.dueAt,
        teacher: assignment.teacher ?? null,
        status: submission?.status ?? HomeworkStatus.pending,
        submissionContent: submission?.content ?? null,
        fileUrls: submission?.fileUrls ?? [],
        submittedAt: submission?.submittedAt ?? null,
        reviewedAt: submission?.reviewedAt ?? null,
        remark: submission?.remark ?? null,
      };
    });
    const summary = {
      total: items.length,
      pending: items.filter(({ status }) => status === "pending").length,
      submitted: items.filter(({ status }) => status === "submitted").length,
      reviewed: items.filter(({ status }) => status === "reviewed").length,
      overdue: items.filter(({ status }) => status === "overdue").length,
    };
    return {
      response: {
        available: items.length > 0,
        summary: items.length > 0 ? summary : null,
        ...(detail ? { items } : {}),
      },
      detailItems: items,
    };
  }

  private homeworkBelongsToDate(
    assignment: HomeworkFact,
    student: StudentCandidate,
    date: ReportDateContext,
  ) {
    if (assignment.classId !== student.class.id) return false;
    if (assignment.dueAt && this.inRange(assignment.dueAt, date.instantRange)) {
      return true;
    }
    if (
      !assignment.dueAt &&
      this.inRange(assignment.createdAt, date.instantRange)
    ) {
      return true;
    }
    const submission = assignment.submissions.find(
      (record) => record.studentId === student.id,
    );
    return Boolean(
      submission &&
      ((submission.submittedAt &&
        this.inRange(submission.submittedAt, date.instantRange)) ||
        (submission.reviewedAt &&
          this.inRange(submission.reviewedAt, date.instantRange))),
    );
  }

  private inRange(value: Date, range: { gte: Date; lt: Date }) {
    return value >= range.gte && value < range.lt;
  }

  private attentionItems(
    pickups: PickupFact[],
    care: CareFact[],
    workflow: Array<{
      status: StudentWorkflowStepStatus;
      completedAt: Date | null;
    }>,
    homework: Array<{ status: HomeworkStatus; submittedAt: Date | null }>,
  ): AttentionItem[] {
    const items: AttentionItem[] = [];
    for (const record of pickups) {
      if (record.isException || record.status !== "normal") {
        items.push({
          source: "pickup",
          level: "high",
          label:
            record.status === "temporary_authorization"
              ? "临时授权接送"
              : "安全接送异常",
          happenedAt: record.happenedAt,
        });
      }
    }
    for (const record of care) {
      if (record.needsAttention) {
        items.push({
          source: "care",
          level: "high",
          label: "生活照护需要关注",
          happenedAt: record.happenedAt,
        });
      } else if (record.type === "exception") {
        items.push({
          source: "care",
          level: "medium",
          label: "生活照护异常记录",
          happenedAt: record.happenedAt,
        });
      }
    }
    for (const step of workflow) {
      if (step.status === "exception") {
        items.push({
          source: "workflow",
          level: "medium",
          label: "托管流程异常",
          happenedAt: step.completedAt,
        });
      }
    }
    for (const item of homework) {
      if (item.status === "overdue") {
        items.push({
          source: "homework",
          level: "low",
          label: "作业已逾期",
          happenedAt: item.submittedAt,
        });
      }
    }
    const levelOrder = { high: 0, medium: 1, low: 2 } as const;
    return items.sort(
      (left, right) => levelOrder[left.level] - levelOrder[right.level],
    );
  }

  private noteResponse(note: NoteFact | undefined, audience: ReportAudience) {
    if (audience === "parent") {
      return note?.publishedAt && note.comment
        ? {
            comment: note.comment,
            publishedAt: note.publishedAt,
            teacher: note.teacher,
          }
        : null;
    }
    return note
      ? {
          comment: note.comment,
          publishedAt: note.publishedAt,
          updatedAt: note.updatedAt,
          isPublished: Boolean(note.publishedAt),
          teacher: note.teacher,
        }
      : {
          comment: null,
          publishedAt: null,
          updatedAt: null,
          isPublished: false,
          teacher: null,
        };
  }
}
