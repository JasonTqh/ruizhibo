import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceType,
  CareExceptionCategory,
  CareMealSlot,
  PickupEventType,
  Prisma,
  StudentCareRecordType,
  StudentStatus,
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
import {
  BatchMealCareDto,
  BatchRestCareDto,
  BatchWaterCareDto,
} from "./dto/batch-care.dto";
import {
  CreateExceptionCareRecordDto,
  CreateMealCareRecordDto,
  CreateMoodCareRecordDto,
  CreateRestCareRecordDto,
  CreateWaterCareRecordDto,
} from "./dto/care-record.dto";
import { AdminCareQueryDto } from "./dto/admin-care-query.dto";

const CARE_RECORD_INCLUDE = Prisma.validator<Prisma.StudentCareRecordInclude>()({
  teacher: { select: { id: true, name: true } },
});

type CareRecordView = Prisma.StudentCareRecordGetPayload<{
  include: typeof CARE_RECORD_INCLUDE;
}>;

type CareClient = Pick<
  Prisma.TransactionClient,
  "attendanceEvent" | "pickupRecord" | "studentCareRecord" | "$executeRaw"
>;

@Injectable()
export class CareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async teacherToday(teacherId: string, classId?: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId, id: classId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        students: {
          where: { status: StudentStatus.active },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
      },
    });
    if (classId && classes.length === 0) {
      throw new NotFoundException("Class not found");
    }

    const serviceDate = chinaBusinessDate();
    const studentIds = classes.flatMap((item) =>
      item.students.map((student) => student.id),
    );
    const [records, absences, pickupRecords] = studentIds.length
      ? await Promise.all([
          this.prisma.studentCareRecord.findMany({
            where: { studentId: { in: studentIds }, serviceDate },
            orderBy: [{ happenedAt: "asc" }, { createdAt: "asc" }],
            include: CARE_RECORD_INCLUDE,
          }),
          this.prisma.attendanceEvent.findMany({
            where: {
              studentId: { in: studentIds },
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(serviceDate),
            },
            select: { studentId: true, happenedAt: true, remark: true },
          }),
          this.prisma.pickupRecord.findMany({
            where: { studentId: { in: studentIds }, serviceDate },
            orderBy: { happenedAt: "asc" },
            select: { studentId: true, type: true, happenedAt: true },
          }),
        ])
      : [[], [], []];

    const recordsByStudent = new Map<string, CareRecordView[]>();
    for (const record of records) {
      const studentRecords = recordsByStudent.get(record.studentId) ?? [];
      studentRecords.push(record);
      recordsByStudent.set(record.studentId, studentRecords);
    }
    const absenceByStudent = new Map(
      absences.map((absence) => [absence.studentId, absence]),
    );
    const pickupByStudent = new Map<
      string,
      Array<{ type: PickupEventType; happenedAt: Date }>
    >();
    for (const record of pickupRecords) {
      const studentRecords = pickupByStudent.get(record.studentId) ?? [];
      studentRecords.push(record);
      pickupByStudent.set(record.studentId, studentRecords);
    }

    const classViews = classes.map((klass) => {
      const students = klass.students.map((student) => {
        const absence = absenceByStudent.get(student.id);
        const pickup = pickupByStudent.get(student.id) ?? [];
        const care = this.summarizeCare(recordsByStudent.get(student.id) ?? []);
        return {
          id: student.id,
          name: student.name,
          pickupStatus: this.pickupStatus(pickup, Boolean(absence)),
          absenceRemark: absence?.remark ?? null,
          care,
        };
      });
      return {
        id: klass.id,
        name: klass.name,
        summary: this.summarizeClass(students),
        students,
      };
    });

    return {
      data: {
        date: businessDateKey(serviceDate),
        classes: classViews,
      },
    };
  }

  async createMeal(
    teacherId: string,
    studentId: string,
    dto: CreateMealCareRecordDto,
  ) {
    const prepared = await this.prepareSingle(
      teacherId,
      studentId,
      dto.happenedAt,
      dto.photoUrls,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.lockCareFact(
        tx,
        `meal:${studentId}:${businessDateKey(prepared.serviceDate)}:${dto.slot}`,
      );
      await this.assertCareTiming(
        tx,
        studentId,
        prepared.serviceDate,
        prepared.happenedAt,
        true,
      );
      const existing = await tx.studentCareRecord.findFirst({
        where: {
          studentId,
          serviceDate: prepared.serviceDate,
          type: StudentCareRecordType.meal,
          mealSlot: dto.slot,
        },
        select: { id: true },
      });
      const data = {
        teacherId,
        value: dto.value,
        happenedAt: prepared.happenedAt,
        remark: this.clean(dto.remark),
        photoUrls: prepared.photoUrls,
      };
      const record = existing
        ? await tx.studentCareRecord.update({
            where: { id: existing.id },
            data,
            include: CARE_RECORD_INCLUDE,
          })
        : await tx.studentCareRecord.create({
            data: {
              studentId,
              type: StudentCareRecordType.meal,
              mealSlot: dto.slot,
              serviceDate: prepared.serviceDate,
              ...data,
            },
            include: CARE_RECORD_INCLUDE,
          });
      await this.audit.log(
        {
          userId: teacherId,
          action: existing ? "teacher.care.meal.update" : "teacher.care.meal.create",
          targetType: "StudentCareRecord",
          targetId: record.id,
          detail: { studentId, slot: dto.slot, value: dto.value },
        },
        tx,
      );
      return { data: record };
    });
  }

  async createRest(
    teacherId: string,
    studentId: string,
    dto: CreateRestCareRecordDto,
  ) {
    const prepared = await this.prepareSingle(
      teacherId,
      studentId,
      dto.happenedAt,
      dto.photoUrls,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.lockCareFact(
        tx,
        `rest:${studentId}:${businessDateKey(prepared.serviceDate)}`,
      );
      await this.assertCareTiming(
        tx,
        studentId,
        prepared.serviceDate,
        prepared.happenedAt,
        true,
      );
      const existing = await tx.studentCareRecord.findFirst({
        where: {
          studentId,
          serviceDate: prepared.serviceDate,
          type: StudentCareRecordType.rest,
        },
        select: { id: true },
      });
      const data = {
        teacherId,
        value: dto.value,
        durationMinutes: dto.durationMinutes,
        happenedAt: prepared.happenedAt,
        remark: this.clean(dto.remark),
        photoUrls: prepared.photoUrls,
      };
      const record = existing
        ? await tx.studentCareRecord.update({
            where: { id: existing.id },
            data,
            include: CARE_RECORD_INCLUDE,
          })
        : await tx.studentCareRecord.create({
            data: {
              studentId,
              type: StudentCareRecordType.rest,
              serviceDate: prepared.serviceDate,
              ...data,
            },
            include: CARE_RECORD_INCLUDE,
          });
      await this.audit.log(
        {
          userId: teacherId,
          action: existing ? "teacher.care.rest.update" : "teacher.care.rest.create",
          targetType: "StudentCareRecord",
          targetId: record.id,
          detail: {
            studentId,
            value: dto.value,
            durationMinutes: dto.durationMinutes ?? null,
          },
        },
        tx,
      );
      return { data: record };
    });
  }

  createWater(
    teacherId: string,
    studentId: string,
    dto: CreateWaterCareRecordDto,
  ) {
    return this.createAppendOnlyRecord(teacherId, studentId, {
      type: StudentCareRecordType.water,
      happenedAt: dto.happenedAt,
      remark: dto.remark,
      photoUrls: dto.photoUrls,
      quantity: 1,
    });
  }

  createMood(
    teacherId: string,
    studentId: string,
    dto: CreateMoodCareRecordDto,
  ) {
    return this.createAppendOnlyRecord(teacherId, studentId, {
      type: StudentCareRecordType.mood,
      happenedAt: dto.happenedAt,
      remark: dto.remark,
      photoUrls: dto.photoUrls,
      value: dto.value,
    });
  }

  createException(
    teacherId: string,
    studentId: string,
    dto: CreateExceptionCareRecordDto,
  ) {
    const remark = this.clean(dto.remark);
    if (!remark) {
      throw new BadRequestException("异常记录必须填写事实说明");
    }
    return this.createAppendOnlyRecord(teacherId, studentId, {
      type: StudentCareRecordType.exception,
      happenedAt: dto.happenedAt,
      photoUrls: dto.photoUrls,
      remark,
      exceptionCategory: dto.category,
      needsAttention: dto.needsAttention,
      resolution: this.clean(dto.resolution),
    });
  }

  async batchMeal(teacherId: string, dto: BatchMealCareDto) {
    const happenedAt = this.eventTime(dto.happenedAt);
    const serviceDate = this.assertToday(happenedAt);
    return this.prisma.$transaction(async (tx) => {
      await this.lockCareFact(
        tx,
        `batch:meal:${dto.classId}:${businessDateKey(serviceDate)}:${dto.slot}`,
      );
      await this.assertBatchStudents(
        tx,
        teacherId,
        dto.classId,
        dto.studentIds,
        serviceDate,
        happenedAt,
      );
      const existing = await tx.studentCareRecord.findMany({
        where: {
          studentId: { in: dto.studentIds },
          serviceDate,
          type: StudentCareRecordType.meal,
          mealSlot: dto.slot,
        },
        select: { studentId: true },
      });
      const existingIds = new Set(existing.map((record) => record.studentId));
      const pendingIds = dto.studentIds.filter((id) => !existingIds.has(id));
      if (pendingIds.length) {
        await tx.studentCareRecord.createMany({
          data: pendingIds.map((studentId) => ({
            studentId,
            teacherId,
            type: StudentCareRecordType.meal,
            mealSlot: dto.slot,
            value: dto.value,
            happenedAt,
            serviceDate,
            remark: this.clean(dto.remark),
          })),
        });
      }
      await this.batchAudit(tx, teacherId, dto.classId, "meal", {
        slot: dto.slot,
        value: dto.value,
        requested: dto.studentIds.length,
        created: pendingIds.length,
        preserved: existingIds.size,
      });
      return {
        data: {
          requested: dto.studentIds.length,
          created: pendingIds.length,
          preserved: existingIds.size,
        },
      };
    });
  }

  async batchRest(teacherId: string, dto: BatchRestCareDto) {
    const happenedAt = this.eventTime(dto.happenedAt);
    const serviceDate = this.assertToday(happenedAt);
    return this.prisma.$transaction(async (tx) => {
      await this.lockCareFact(
        tx,
        `batch:rest:${dto.classId}:${businessDateKey(serviceDate)}`,
      );
      await this.assertBatchStudents(
        tx,
        teacherId,
        dto.classId,
        dto.studentIds,
        serviceDate,
        happenedAt,
      );
      const existing = await tx.studentCareRecord.findMany({
        where: {
          studentId: { in: dto.studentIds },
          serviceDate,
          type: StudentCareRecordType.rest,
        },
        select: { studentId: true },
      });
      const existingIds = new Set(existing.map((record) => record.studentId));
      const pendingIds = dto.studentIds.filter((id) => !existingIds.has(id));
      if (pendingIds.length) {
        await tx.studentCareRecord.createMany({
          data: pendingIds.map((studentId) => ({
            studentId,
            teacherId,
            type: StudentCareRecordType.rest,
            value: dto.value,
            durationMinutes: dto.durationMinutes,
            happenedAt,
            serviceDate,
            remark: this.clean(dto.remark),
          })),
        });
      }
      await this.batchAudit(tx, teacherId, dto.classId, "rest", {
        value: dto.value,
        durationMinutes: dto.durationMinutes ?? null,
        requested: dto.studentIds.length,
        created: pendingIds.length,
        preserved: existingIds.size,
      });
      return {
        data: {
          requested: dto.studentIds.length,
          created: pendingIds.length,
          preserved: existingIds.size,
        },
      };
    });
  }

  async batchWater(teacherId: string, dto: BatchWaterCareDto) {
    const happenedAt = this.eventTime(dto.happenedAt);
    const serviceDate = this.assertToday(happenedAt);
    return this.prisma.$transaction(async (tx) => {
      await this.lockCareFact(
        tx,
        `batch:water:${dto.classId}:${businessDateKey(serviceDate)}`,
      );
      await this.assertBatchStudents(
        tx,
        teacherId,
        dto.classId,
        dto.studentIds,
        serviceDate,
        happenedAt,
      );
      await tx.studentCareRecord.createMany({
        data: dto.studentIds.map((studentId) => ({
          studentId,
          teacherId,
          type: StudentCareRecordType.water,
          quantity: 1,
          happenedAt,
          serviceDate,
          remark: this.clean(dto.remark),
        })),
      });
      await this.batchAudit(tx, teacherId, dto.classId, "water", {
        created: dto.studentIds.length,
      });
      return { data: { created: dto.studentIds.length } };
    });
  }

  async parentToday(parentId: string, studentId: string) {
    await this.assertParentStudent(parentId, studentId);
    const serviceDate = chinaBusinessDate();
    const records = await this.prisma.studentCareRecord.findMany({
      where: { studentId, serviceDate },
      orderBy: [{ happenedAt: "asc" }, { createdAt: "asc" }],
      include: CARE_RECORD_INCLUDE,
    });
    const summary = this.summarizeCare(records);
    return {
      data: {
        date: businessDateKey(serviceDate),
        meal: {
          snack: this.parentRecord(summary.meal.snack),
          dinner: this.parentRecord(summary.meal.dinner),
        },
        water: {
          count: summary.water.count,
          lastAt: summary.water.lastAt,
        },
        rest: this.parentRecord(summary.rest),
        mood: this.parentRecord(summary.mood),
        exceptions: summary.exceptions.map((record) =>
          this.parentRecord(record),
        ),
      },
    };
  }

  async adminRecords(query: AdminCareQueryDto) {
    const { gte, lte } = this.adminServiceDateRange(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const type =
      query.quickFilter === "today_exception"
        ? StudentCareRecordType.exception
        : query.type;
    const needsAttention =
      query.quickFilter === "needs_attention" ? true : query.needsAttention;
    const where: Prisma.StudentCareRecordWhereInput = {
      serviceDate: { gte, lte },
      type,
      needsAttention,
      studentId: query.studentId,
      teacherId: query.teacherId,
      student: query.classId ? { classId: query.classId } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentCareRecord.findMany({
        where,
        orderBy: [
          { needsAttention: "desc" },
          { happenedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      this.prisma.studentCareRecord.count({ where }),
    ]);
    return { data: { items, total, page, pageSize } };
  }

  private async createAppendOnlyRecord(
    teacherId: string,
    studentId: string,
    input: {
      type: "water" | "mood" | "exception";
      happenedAt?: string;
      value?: string;
      quantity?: number;
      exceptionCategory?: CareExceptionCategory;
      needsAttention?: boolean;
      remark?: string;
      resolution?: string;
      photoUrls?: string[];
    },
  ) {
    const prepared = await this.prepareSingle(
      teacherId,
      studentId,
      input.happenedAt,
      input.photoUrls,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.assertCareTiming(
        tx,
        studentId,
        prepared.serviceDate,
        prepared.happenedAt,
        input.type !== StudentCareRecordType.exception,
      );
      const record = await tx.studentCareRecord.create({
        data: {
          studentId,
          teacherId,
          type: input.type,
          value: input.value,
          quantity: input.quantity,
          exceptionCategory: input.exceptionCategory,
          happenedAt: prepared.happenedAt,
          serviceDate: prepared.serviceDate,
          needsAttention: input.needsAttention ?? false,
          remark: this.clean(input.remark),
          resolution: this.clean(input.resolution),
          photoUrls: prepared.photoUrls,
        },
        include: CARE_RECORD_INCLUDE,
      });
      await this.audit.log(
        {
          userId: teacherId,
          action: `teacher.care.${input.type}.create`,
          targetType: "StudentCareRecord",
          targetId: record.id,
          detail: {
            studentId,
            needsAttention: input.needsAttention ?? false,
          },
        },
        tx,
      );
      return { data: record };
    });
  }

  private async prepareSingle(
    teacherId: string,
    studentId: string,
    happenedAtValue?: string,
    photoUrls: string[] = [],
  ) {
    const [student, validPhotoUrls] = await Promise.all([
      this.assertTeacherStudent(teacherId, studentId),
      assertOwnedFileAssetUrls(this.prisma, {
        ownerId: teacherId,
        scene: "care",
        urls: photoUrls,
        imageOnly: true,
        invalidMessage: "生活照护图片不存在、类型不正确或无权使用",
      }),
    ]);
    const happenedAt = this.eventTime(happenedAtValue);
    return {
      student,
      happenedAt,
      serviceDate: this.assertToday(happenedAt),
      photoUrls: validPhotoUrls,
    };
  }

  private async assertTeacherStudent(teacherId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        status: StudentStatus.active,
        class: { teacherId },
      },
      select: {
        id: true,
        name: true,
        classId: true,
        class: { select: { id: true, name: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  private async assertBatchStudents(
    tx: Prisma.TransactionClient,
    teacherId: string,
    classId: string,
    studentIds: string[],
    serviceDate: Date,
    happenedAt: Date,
  ) {
    const klass = await tx.class.findFirst({
      where: { id: classId, teacherId },
      select: { id: true },
    });
    if (!klass) throw new NotFoundException("Class not found");
    const students = await tx.student.findMany({
      where: {
        id: { in: studentIds },
        classId,
        status: StudentStatus.active,
      },
      select: { id: true },
    });
    if (students.length !== studentIds.length) {
      throw new NotFoundException("部分学生不存在、不在当前班级或已停用");
    }
    const [absences, laterLeaves] = await Promise.all([
      tx.attendanceEvent.findMany({
        where: {
          studentId: { in: studentIds },
          type: AttendanceType.absence,
          happenedAt: chinaDayInstantRange(serviceDate),
        },
        select: { studentId: true },
      }),
      tx.pickupRecord.findMany({
        where: {
          studentId: { in: studentIds },
          serviceDate,
          type: PickupEventType.left_center,
          happenedAt: { lt: happenedAt },
        },
        select: { studentId: true },
      }),
    ]);
    if (absences.length) {
      throw new ConflictException(
        "批量记录包含今日已请假/缺勤的学生，未写入任何生活记录",
      );
    }
    if (laterLeaves.length) {
      throw new ConflictException(
        "批量记录包含已离店学生，未写入任何生活记录",
      );
    }
  }

  private async assertCareTiming(
    client: CareClient,
    studentId: string,
    serviceDate: Date,
    happenedAt: Date,
    blockAfterLeave: boolean,
  ) {
    const [absence, leave] = await Promise.all([
      client.attendanceEvent.findFirst({
        where: {
          studentId,
          type: AttendanceType.absence,
          happenedAt: chinaDayInstantRange(serviceDate),
        },
        select: { id: true },
      }),
      blockAfterLeave
        ? client.pickupRecord.findFirst({
            where: {
              studentId,
              serviceDate,
              type: PickupEventType.left_center,
            },
            orderBy: { happenedAt: "asc" },
            select: { happenedAt: true },
          })
        : Promise.resolve(null),
    ]);
    if (absence) {
      throw new ConflictException(
        "该学生今天已登记缺勤，不能添加生活记录",
      );
    }
    if (leave && happenedAt > leave.happenedAt) {
      throw new ConflictException(
        "该学生在该记录时间前已经离店，不能添加生活记录",
      );
    }
  }

  private async assertParentStudent(parentId: string, studentId: string) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: { parentId, studentId, status: "active" },
      select: { id: true },
    });
    if (!guardian) throw new NotFoundException("Student not found");
  }

  private summarizeCare(records: CareRecordView[]) {
    const mealRecords = records.filter(
      (record) => record.type === StudentCareRecordType.meal,
    );
    const waterRecords = records.filter(
      (record) => record.type === StudentCareRecordType.water,
    );
    const restRecords = records.filter(
      (record) => record.type === StudentCareRecordType.rest,
    );
    const moodRecords = records.filter(
      (record) => record.type === StudentCareRecordType.mood,
    );
    const exceptions = records
      .filter((record) => record.type === StudentCareRecordType.exception)
      .sort(
        (left, right) =>
          Number(right.needsAttention) - Number(left.needsAttention) ||
          right.happenedAt.getTime() - left.happenedAt.getTime(),
      );
    return {
      meal: {
        snack:
          mealRecords.find((record) => record.mealSlot === CareMealSlot.snack) ??
          null,
        dinner:
          mealRecords.find((record) => record.mealSlot === CareMealSlot.dinner) ??
          null,
      },
      water: {
        count: waterRecords.reduce(
          (total, record) => total + (record.quantity ?? 1),
          0,
        ),
        lastAt: waterRecords[waterRecords.length - 1]?.happenedAt ?? null,
      },
      rest: restRecords[restRecords.length - 1] ?? null,
      mood: moodRecords[moodRecords.length - 1] ?? null,
      exceptions,
      needsAttentionCount: exceptions.filter((record) => record.needsAttention)
        .length,
    };
  }

  private summarizeClass(
    students: Array<{
      pickupStatus: string;
      care: ReturnType<CareService["summarizeCare"]>;
    }>,
  ) {
    const values = (records: Array<CareRecordView | null>, allowed: string[]) =>
      Object.fromEntries(
        allowed.map((value) => [
          value,
          records.filter((record) => record?.value === value).length,
        ]),
      );
    const dinner = students.map((student) => student.care.meal.dinner);
    const rest = students.map((student) => student.care.rest);
    const mood = students.map((student) => student.care.mood);
    return {
      total: students.length,
      absent: students.filter((student) => student.pickupStatus === "absent")
        .length,
      dinner: {
        ...values(dinner, ["good", "normal", "little", "refused"]),
        unrecorded: dinner.filter((record) => !record).length,
      },
      water: {
        events: students.reduce(
          (total, student) => total + student.care.water.count,
          0,
        ),
        students: students.filter((student) => student.care.water.count > 0)
          .length,
      },
      rest: {
        ...values(rest, ["slept", "rested", "no_rest"]),
        unrecorded: rest.filter((record) => !record).length,
      },
      mood: {
        ...values(mood, ["good", "normal", "low", "upset"]),
        unrecorded: mood.filter((record) => !record).length,
      },
      exceptions: students.reduce(
        (total, student) => total + student.care.exceptions.length,
        0,
      ),
      needsAttention: students.reduce(
        (total, student) => total + student.care.needsAttentionCount,
        0,
      ),
    };
  }

  private parentRecord(record: CareRecordView | null) {
    if (!record) return null;
    return {
      id: record.id,
      type: record.type,
      mealSlot: record.mealSlot,
      value: record.value,
      quantity: record.quantity,
      durationMinutes: record.durationMinutes,
      exceptionCategory: record.exceptionCategory,
      happenedAt: record.happenedAt,
      needsAttention: record.needsAttention,
      remark: record.remark,
      resolution: record.resolution,
      photoUrls: record.photoUrls,
      teacher: record.teacher ? { name: record.teacher.name } : null,
    };
  }

  private pickupStatus(
    records: Array<{ type: PickupEventType; happenedAt: Date }>,
    absent: boolean,
  ) {
    if (absent) return "absent";
    const types = new Set(records.map((record) => record.type));
    if (types.has(PickupEventType.left_center)) return "left";
    if (types.has(PickupEventType.arrived_at_center)) return "in_care";
    if (types.has(PickupEventType.picked_up_from_school)) return "picked_up";
    return "waiting_pickup";
  }

  private eventTime(value?: string) {
    const happenedAt = value ? new Date(value) : new Date();
    if (Number.isNaN(happenedAt.getTime())) {
      throw new BadRequestException("happenedAt is invalid");
    }
    if (happenedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException("生活记录时间不能晚于当前时间");
    }
    return happenedAt;
  }

  private assertToday(happenedAt: Date) {
    const serviceDate = chinaBusinessDate(happenedAt);
    if (businessDateKey(serviceDate) !== businessDateKey(chinaBusinessDate())) {
      throw new BadRequestException("生活记录只允许登记当前业务日");
    }
    return serviceDate;
  }

  private adminServiceDateRange(query: AdminCareQueryDto) {
    const today = chinaBusinessDate();
    if (query.quickFilter === "today_exception") {
      return { gte: today, lte: today };
    }
    const from = query.from
      ? parseBusinessDate(query.from)
      : query.to
        ? parseBusinessDate(query.to)
        : today;
    const to = query.to
      ? parseBusinessDate(query.to)
      : query.from
        ? parseBusinessDate(query.from)
        : today;
    if (!from || !to) throw new BadRequestException("日期格式无效");
    if (from > to) {
      throw new BadRequestException("开始日期不能晚于结束日期");
    }
    const dayCount =
      Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) +
      1;
    if (dayCount > 31) {
      throw new BadRequestException("生活照护记录查询范围不能超过 31 天");
    }
    return { gte: from, lte: to };
  }

  private async lockCareFact(tx: Prisma.TransactionClient, key: string) {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`care:${key}`}, 0))
    `;
  }

  private batchAudit(
    tx: Prisma.TransactionClient,
    teacherId: string,
    classId: string,
    type: "meal" | "water" | "rest",
    detail: Prisma.InputJsonObject,
  ) {
    return this.audit.log(
      {
        userId: teacherId,
        action: `teacher.care.${type}.batch`,
        targetType: "Class",
        targetId: classId,
        detail,
      },
      tx,
    );
  }

  private clean(value?: string) {
    const cleaned = value?.trim();
    return cleaned || undefined;
  }
}
