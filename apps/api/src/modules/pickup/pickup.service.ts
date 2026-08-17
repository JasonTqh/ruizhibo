import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceType,
  PickupArrivalMethod,
  PickupEventType,
  PickupHandoffStatus,
  Prisma,
  StudentStatus,
  UserStatus,
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
  CreateAuthorizedPickupPersonDto,
  UpdateAuthorizedPickupPersonDto,
} from "./dto/authorized-pickup-person.dto";
import { BatchPickupDto } from "./dto/batch-pickup.dto";
import { LeaveStudentDto } from "./dto/leave-student.dto";
import { ArriveStudentDto, PickupEventDto } from "./dto/pickup-event.dto";
import {
  AdminPickupQueryDto,
  ParentPickupHistoryQueryDto,
} from "./dto/pickup-query.dto";

const PICKUP_RECORD_INCLUDE = Prisma.validator<Prisma.PickupRecordInclude>()({
  student: { select: { id: true, name: true } },
  campus: { select: { id: true, name: true } },
  class: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
});

type PickupRecordView = Prisma.PickupRecordGetPayload<{
  include: typeof PICKUP_RECORD_INCLUDE;
}>;

type TeacherStudent = {
  id: string;
  name: string;
  classId: string;
  class: {
    id: string;
    name: string;
    campusId: string;
    campus: { id: string; name: string };
  };
};

type PickupFactInput = {
  type: PickupEventType;
  arrivalMethod?: PickupArrivalMethod;
  studentGuardianId?: string;
  pickupPersonId?: string;
  pickupPersonNameSnapshot?: string;
  relationshipSnapshot?: string;
  phoneSnapshot?: string;
  status?: PickupHandoffStatus;
  isException?: boolean;
  exceptionReason?: string;
  resolution?: string;
  remark?: string;
};

type BatchPickupEventType = "picked_up_from_school" | "arrived_at_center";

@Injectable()
export class PickupService {
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
        campus: { select: { id: true, name: true } },
        students: {
          where: { status: StudentStatus.active },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            guardians: {
              where: {
                status: "active",
                parent: { status: UserStatus.active },
              },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                relation: true,
                canPickup: true,
                parent: {
                  select: { id: true, name: true, phone: true },
                },
              },
            },
            authorizedPickupPeople: {
              where: { isActive: true },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                relationship: true,
                phone: true,
              },
            },
          },
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
    const [records, absences] = studentIds.length
      ? await Promise.all([
          this.prisma.pickupRecord.findMany({
            where: { studentId: { in: studentIds }, serviceDate },
            orderBy: { happenedAt: "asc" },
            include: PICKUP_RECORD_INCLUDE,
          }),
          this.prisma.attendanceEvent.findMany({
            where: {
              studentId: { in: studentIds },
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(serviceDate),
            },
            select: { studentId: true, happenedAt: true, remark: true },
          }),
        ])
      : [[], []];

    const absentByStudent = new Map(
      absences.map((event) => [event.studentId, event]),
    );
    const recordsByStudent = new Map<string, PickupRecordView[]>();
    for (const record of records) {
      const list = recordsByStudent.get(record.studentId) ?? [];
      list.push(record);
      recordsByStudent.set(record.studentId, list);
    }

    const classViews = classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      campus: klass.campus,
      students: klass.students.map((student) => {
        const studentRecords = recordsByStudent.get(student.id) ?? [];
        const absence = absentByStudent.get(student.id);
        const guardianPeople = student.guardians.map((guardian) => ({
          id: guardian.id,
          type: "guardian" as const,
          name: guardian.parent.name,
          relationship: guardian.relation,
          phone: guardian.parent.phone,
        }));
        const authorizedPeople = student.authorizedPickupPeople.map(
          (person) => ({
            id: person.id,
            type: "authorized_person" as const,
            name: person.name,
            relationship: person.relationship,
            phone: person.phone,
          }),
        );
        return {
          id: student.id,
          name: student.name,
          status: this.deriveStudentStatus(studentRecords, Boolean(absence)),
          lastEventAt:
            studentRecords[studentRecords.length - 1]?.happenedAt ??
            absence?.happenedAt ??
            null,
          absenceRemark: absence?.remark ?? null,
          events: studentRecords,
          pickupPeople: [
            ...guardianPeople.filter(
              (_, index) => student.guardians[index].canPickup,
            ),
            ...authorizedPeople,
          ],
          deliveryPeople: [...guardianPeople, ...authorizedPeople],
        };
      }),
    }));
    const students = classViews.flatMap((item) => item.students);

    return {
      data: {
        date: businessDateKey(serviceDate),
        summary: {
          total: students.length,
          waiting: students.filter((item) => item.status === "waiting_pickup")
            .length,
          pickedUp: students.filter((item) => item.status === "picked_up")
            .length,
          inCare: students.filter((item) => item.status === "in_care").length,
          left: students.filter((item) => item.status === "left").length,
          absent: students.filter((item) => item.status === "absent").length,
          exceptions: records.filter((item) => item.isException).length,
        },
        classes: classViews,
      },
    };
  }

  async pickedUpFromSchool(
    teacherId: string,
    studentId: string,
    dto: PickupEventDto,
  ) {
    const student = await this.assertTeacherStudent(teacherId, studentId);
    const existing = await this.todayRecordTypes(studentId);
    if (existing.has(PickupEventType.picked_up_from_school)) {
      throw new ConflictException("该学生今天已经登记为已接到");
    }
    if (
      existing.has(PickupEventType.arrived_at_center) ||
      existing.has(PickupEventType.left_center)
    ) {
      throw new ConflictException("该学生今天已经到店，不能补录学校接到");
    }
    await this.assertNotAbsentToday(studentId);

    return this.createFact(teacherId, student, {
      type: PickupEventType.picked_up_from_school,
      remark: this.clean(dto.remark),
    });
  }

  async arrivedAtCenter(
    teacherId: string,
    studentId: string,
    dto: ArriveStudentDto,
  ) {
    const student = await this.assertTeacherStudent(teacherId, studentId);
    const existing = await this.todayRecordTypes(studentId);
    if (existing.has(PickupEventType.arrived_at_center)) {
      throw new ConflictException("该学生今天已经登记到店");
    }
    if (existing.has(PickupEventType.left_center)) {
      throw new ConflictException("该学生今天已经离店，不能重复登记到店");
    }
    const pickedUp = existing.has(PickupEventType.picked_up_from_school);
    if (dto.arrivalMethod === PickupArrivalMethod.teacher_pickup && !pickedUp) {
      throw new BadRequestException("教师接送到店前必须先登记学校接到");
    }
    if (pickedUp && dto.arrivalMethod !== PickupArrivalMethod.teacher_pickup) {
      throw new BadRequestException(
        "已登记学校接到的学生必须使用教师接送方式到店",
      );
    }
    await this.assertNotAbsentToday(studentId);
    const delivery = await this.resolveDeliveryPerson(studentId, dto);

    return this.createFact(teacherId, student, {
      type: PickupEventType.arrived_at_center,
      arrivalMethod: dto.arrivalMethod,
      ...delivery,
      remark: this.clean(dto.remark),
    });
  }

  async leftCenter(teacherId: string, studentId: string, dto: LeaveStudentDto) {
    const student = await this.assertTeacherStudent(teacherId, studentId);
    await this.assertNotAbsentToday(studentId);
    const existing = await this.todayRecordTypes(studentId);
    if (!existing.has(PickupEventType.arrived_at_center)) {
      throw new BadRequestException("学生尚未到店，不能办理离店");
    }
    if (existing.has(PickupEventType.left_center)) {
      throw new ConflictException("该学生今天已经办理离店");
    }

    const handoff = await this.resolveHandoff(studentId, dto);
    return this.createFact(teacherId, student, {
      type: PickupEventType.left_center,
      ...handoff,
      remark: this.clean(dto.remark),
    });
  }

  async batchPickedUpFromSchool(teacherId: string, dto: BatchPickupDto) {
    return this.createBatchFacts(
      teacherId,
      dto.studentIds,
      PickupEventType.picked_up_from_school,
    );
  }

  async batchArrivedAtCenter(teacherId: string, dto: BatchPickupDto) {
    return this.createBatchFacts(
      teacherId,
      dto.studentIds,
      PickupEventType.arrived_at_center,
    );
  }

  async parentToday(parentId: string, studentId: string) {
    await this.assertParentStudent(parentId, studentId);
    const serviceDate = chinaBusinessDate();
    const [records, absence] = await Promise.all([
      this.prisma.pickupRecord.findMany({
        where: { studentId, serviceDate },
        orderBy: { happenedAt: "asc" },
        include: PICKUP_RECORD_INCLUDE,
      }),
      this.prisma.attendanceEvent.findFirst({
        where: {
          studentId,
          type: AttendanceType.absence,
          happenedAt: chinaDayInstantRange(serviceDate),
        },
        orderBy: { happenedAt: "asc" },
        select: { happenedAt: true, remark: true },
      }),
    ]);
    return {
      data: {
        date: businessDateKey(serviceDate),
        status: this.deriveStudentStatus(records, Boolean(absence)),
        absenceRemark: absence?.remark ?? null,
        events: records.map((record) => this.parentRecord(record)),
      },
    };
  }

  async parentHistory(
    parentId: string,
    studentId: string,
    query: ParentPickupHistoryQueryDto,
  ) {
    await this.assertParentStudent(parentId, studentId);
    const { page, pageSize } = query;
    const where: Prisma.PickupRecordWhereInput = {
      studentId,
      serviceDate: this.serviceDateRange(query.from, query.to),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pickupRecord.findMany({
        where,
        orderBy: [{ serviceDate: "desc" }, { happenedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: PICKUP_RECORD_INCLUDE,
      }),
      this.prisma.pickupRecord.count({ where }),
    ]);
    return {
      data: {
        items: items.map((record) => this.parentRecord(record)),
        total,
        page,
        pageSize,
      },
    };
  }

  async listAuthorizedPeople(studentId: string) {
    await this.assertStudentExists(studentId);
    const people = await this.prisma.authorizedPickupPerson.findMany({
      where: { studentId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
    return { data: people };
  }

  async createAuthorizedPerson(
    actorId: string,
    studentId: string,
    dto: CreateAuthorizedPickupPersonDto,
  ) {
    await this.assertStudentExists(studentId);
    const person = await this.prisma.authorizedPickupPerson.create({
      data: {
        studentId,
        name: dto.name.trim(),
        relationship: dto.relationship,
        phone: this.clean(dto.phone),
        isActive: dto.isActive,
        remark: this.clean(dto.remark),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.pickupPerson.create",
      targetType: "AuthorizedPickupPerson",
      targetId: person.id,
      detail: { studentId, relationship: person.relationship },
    });
    return { data: person };
  }

  async updateAuthorizedPerson(
    actorId: string,
    personId: string,
    dto: UpdateAuthorizedPickupPersonDto,
  ) {
    const current = await this.prisma.authorizedPickupPerson.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!current)
      throw new NotFoundException("Authorized pickup person not found");
    const person = await this.prisma.authorizedPickupPerson.update({
      where: { id: personId },
      data: {
        name: dto.name?.trim(),
        relationship: dto.relationship,
        phone: dto.phone === undefined ? undefined : this.clean(dto.phone),
        isActive: dto.isActive,
        remark: dto.remark === undefined ? undefined : this.clean(dto.remark),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: "admin.pickupPerson.update",
      targetType: "AuthorizedPickupPerson",
      targetId: person.id,
      detail: dto as Prisma.InputJsonValue,
    });
    return { data: person };
  }

  async adminRecords(query: AdminPickupQueryDto) {
    if (
      query.quickFilter === "missing_arrival_today" ||
      query.quickFilter === "missing_leave_today"
    ) {
      return this.adminMissingRecords(query);
    }
    const { page, pageSize } = query;
    const where: Prisma.PickupRecordWhereInput = {
      campusId: query.campusId,
      classId: query.classId,
      teacherId: query.teacherId,
      studentId: query.studentId,
      type: query.type,
      status: query.status,
      isException: query.quickFilter === "exception" ? true : query.isException,
      serviceDate: this.serviceDateRange(query.from, query.to),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pickupRecord.findMany({
        where,
        orderBy: [{ serviceDate: "desc" }, { happenedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: PICKUP_RECORD_INCLUDE,
      }),
      this.prisma.pickupRecord.count({ where }),
    ]);
    return { data: { items, total, page, pageSize } };
  }

  private async adminMissingRecords(query: AdminPickupQueryDto) {
    const { page, pageSize } = query;
    const serviceDate = chinaBusinessDate();
    const missingArrival = query.quickFilter === "missing_arrival_today";
    const pickupRecords: Prisma.PickupRecordListRelationFilter = missingArrival
      ? {
          none: {
            serviceDate,
            type: PickupEventType.arrived_at_center,
          },
        }
      : {
          some: {
            serviceDate,
            type: PickupEventType.arrived_at_center,
          },
          none: {
            serviceDate,
            type: PickupEventType.left_center,
          },
        };
    const where: Prisma.StudentWhereInput = {
      id: query.studentId,
      status: StudentStatus.active,
      classId: query.classId,
      class: {
        campusId: query.campusId,
        teacherId: query.teacherId,
      },
      pickupRecords,
      attendance: missingArrival
        ? {
            none: {
              type: AttendanceType.absence,
              happenedAt: chinaDayInstantRange(serviceDate),
            },
          }
        : undefined,
    };
    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          class: {
            include: {
              campus: { select: { id: true, name: true } },
              teacher: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.student.count({ where }),
    ]);
    return {
      data: {
        items: students.map((student) => ({
          id: `${missingArrival ? "missing-arrival" : "missing-leave"}:${student.id}`,
          type: null,
          status: missingArrival ? "missing_arrival" : "missing_leave",
          serviceDate,
          happenedAt: null,
          isException: false,
          student: { id: student.id, name: student.name },
          class: { id: student.class.id, name: student.class.name },
          campus: student.class.campus,
          teacher: student.class.teacher,
          createdBy: null,
        })),
        total,
        page,
        pageSize,
      },
    };
  }

  private async createBatchFacts(
    teacherId: string,
    studentIds: string[],
    type: BatchPickupEventType,
  ) {
    const students = await this.assertTeacherStudents(teacherId, studentIds);
    const happenedAt = new Date();
    const serviceDate = chinaBusinessDate(happenedAt);
    const [records, absences] = await Promise.all([
      this.prisma.pickupRecord.findMany({
        where: { studentId: { in: studentIds }, serviceDate },
        select: { studentId: true, type: true },
      }),
      this.prisma.attendanceEvent.findMany({
        where: {
          studentId: { in: studentIds },
          type: AttendanceType.absence,
          happenedAt: chinaDayInstantRange(serviceDate),
        },
        select: { studentId: true },
      }),
    ]);

    const typesByStudent = new Map<string, Set<PickupEventType>>();
    for (const record of records) {
      const types =
        typesByStudent.get(record.studentId) ?? new Set<PickupEventType>();
      types.add(record.type);
      typesByStudent.set(record.studentId, types);
    }

    const blockedAbsences = absences;
    if (blockedAbsences.length > 0) {
      const absentIds = new Set(
        blockedAbsences.map((event) => event.studentId),
      );
      const names = students
        .filter((student) => absentIds.has(student.id))
        .map((student) => student.name)
        .join("、");
      throw new ConflictException(`${names}已登记请假/缺勤，不能执行接送操作`);
    }

    for (const student of students) {
      const existing =
        typesByStudent.get(student.id) ?? new Set<PickupEventType>();
      this.assertBatchTransition(student.name, existing, type);
    }

    try {
      const items = await this.prisma.$transaction(async (transaction) => {
        const created: PickupRecordView[] = [];
        for (const student of students) {
          created.push(
            await this.createFactInTransaction(
              transaction,
              teacherId,
              student,
              {
                type,
                ...(type === PickupEventType.arrived_at_center
                  ? { arrivalMethod: PickupArrivalMethod.teacher_pickup }
                  : {}),
              },
              happenedAt,
              serviceDate,
            ),
          );
        }
        return created;
      });
      return { data: { count: items.length, items } };
    } catch (error) {
      this.rethrowPickupWriteError(error);
    }
  }

  private async createFact(
    teacherId: string,
    student: TeacherStudent,
    input: PickupFactInput,
  ) {
    const happenedAt = new Date();
    const serviceDate = chinaBusinessDate(happenedAt);
    try {
      const record = await this.prisma.$transaction((transaction) =>
        this.createFactInTransaction(
          transaction,
          teacherId,
          student,
          input,
          happenedAt,
          serviceDate,
        ),
      );
      return { data: record };
    } catch (error) {
      this.rethrowPickupWriteError(error);
    }
  }

  private async createFactInTransaction(
    transaction: Prisma.TransactionClient,
    teacherId: string,
    student: TeacherStudent,
    input: PickupFactInput,
    happenedAt: Date,
    serviceDate: Date,
  ) {
    await this.assertNotAbsentToday(student.id, serviceDate, transaction);

    const created = await transaction.pickupRecord.create({
      data: {
        studentId: student.id,
        campusId: student.class.campusId,
        classId: student.classId,
        serviceDate,
        happenedAt,
        teacherId,
        createdById: teacherId,
        status: PickupHandoffStatus.normal,
        isException: false,
        ...input,
      },
    });

    let attendanceEventId: string | null = null;
    const attendanceType =
      input.type === PickupEventType.arrived_at_center
        ? AttendanceType.arrive
        : input.type === PickupEventType.left_center
          ? AttendanceType.leave
          : null;
    if (attendanceType) {
      const existingAttendance = await transaction.attendanceEvent.findFirst({
        where: {
          studentId: student.id,
          type: attendanceType,
          happenedAt: chinaDayInstantRange(serviceDate),
        },
        orderBy: { happenedAt: "asc" },
        select: { id: true },
      });
      const attendance =
        existingAttendance ??
        (await transaction.attendanceEvent.create({
          data: {
            studentId: student.id,
            type: attendanceType,
            happenedAt,
            teacherId,
            remark: this.attendanceRemark(input),
          },
          select: { id: true },
        }));
      attendanceEventId = attendance.id;
      await transaction.pickupRecord.update({
        where: { id: created.id },
        data: { attendanceEventId },
      });
    }

    await this.audit.log(
      {
        userId: teacherId,
        action: `teacher.pickup.${input.type}`,
        targetType: "PickupRecord",
        targetId: created.id,
        detail: {
          studentId: student.id,
          classId: student.classId,
          campusId: student.class.campusId,
          serviceDate: businessDateKey(serviceDate),
          type: input.type,
          arrivalMethod: input.arrivalMethod ?? null,
          studentGuardianId: input.studentGuardianId ?? null,
          pickupPersonId: input.pickupPersonId ?? null,
          status: input.status ?? PickupHandoffStatus.normal,
          isException: input.isException ?? false,
          attendanceEventId,
        },
      },
      transaction,
    );

    return transaction.pickupRecord.findUniqueOrThrow({
      where: { id: created.id },
      include: PICKUP_RECORD_INCLUDE,
    });
  }

  private async resolveDeliveryPerson(
    studentId: string,
    dto: ArriveStudentDto,
  ) {
    const hasDeliveryReference = Boolean(
      dto.deliveryPersonId || dto.deliveryPersonType,
    );
    if (
      dto.arrivalMethod !== PickupArrivalMethod.parent_delivered &&
      hasDeliveryReference
    ) {
      throw new BadRequestException("只有家长送达可以记录具体送达人");
    }
    if (!hasDeliveryReference) return {};
    if (!dto.deliveryPersonId || !dto.deliveryPersonType) {
      throw new BadRequestException("送达人类型和送达人编号必须同时提供");
    }

    if (dto.deliveryPersonType === "guardian") {
      const guardian = await this.prisma.studentGuardian.findFirst({
        where: {
          id: dto.deliveryPersonId,
          studentId,
          status: "active",
          parent: { status: UserStatus.active },
        },
        include: { parent: { select: { name: true, phone: true } } },
      });
      if (!guardian) {
        throw new BadRequestException("送达人不是该学生的有效监护人");
      }
      return {
        studentGuardianId: guardian.id,
        pickupPersonNameSnapshot: guardian.parent.name,
        relationshipSnapshot: guardian.relation,
        phoneSnapshot: guardian.parent.phone ?? undefined,
      };
    }

    const person = await this.prisma.authorizedPickupPerson.findFirst({
      where: { id: dto.deliveryPersonId, studentId, isActive: true },
    });
    if (!person) {
      throw new BadRequestException("送达人授权已停用或不属于该学生");
    }
    return {
      pickupPersonId: person.id,
      pickupPersonNameSnapshot: person.name,
      relationshipSnapshot: person.relationship,
      phoneSnapshot: person.phone ?? undefined,
    };
  }

  private async resolveHandoff(studentId: string, dto: LeaveStudentDto) {
    const status = dto.status ?? PickupHandoffStatus.normal;
    let studentGuardianId: string | undefined;
    let pickupPersonId: string | undefined;
    let pickupPersonNameSnapshot: string;
    let relationshipSnapshot: string;
    let phoneSnapshot: string | undefined;

    if (dto.pickupPersonId || dto.pickupPersonType) {
      if (!dto.pickupPersonId || !dto.pickupPersonType) {
        throw new BadRequestException("接送人类型和接送人编号必须同时提供");
      }
      if (status === PickupHandoffStatus.temporary_authorization) {
        throw new BadRequestException("临时接送人不能引用已有授权接送人");
      }
      if (dto.pickupPersonType === "guardian") {
        const guardian = await this.prisma.studentGuardian.findFirst({
          where: {
            id: dto.pickupPersonId,
            studentId,
            status: "active",
            canPickup: true,
            parent: { status: UserStatus.active },
          },
          include: { parent: { select: { name: true, phone: true } } },
        });
        if (!guardian) {
          throw new BadRequestException("监护人未授权接送或授权已停用");
        }
        studentGuardianId = guardian.id;
        pickupPersonNameSnapshot = guardian.parent.name;
        relationshipSnapshot = guardian.relation;
        phoneSnapshot = guardian.parent.phone ?? undefined;
      } else {
        const person = await this.prisma.authorizedPickupPerson.findFirst({
          where: { id: dto.pickupPersonId, studentId, isActive: true },
        });
        if (!person) {
          throw new BadRequestException("接送人未授权、已停用或不属于该学生");
        }
        pickupPersonId = person.id;
        pickupPersonNameSnapshot = person.name;
        relationshipSnapshot = person.relationship;
        phoneSnapshot = person.phone ?? undefined;
      }
    } else {
      if (status === PickupHandoffStatus.normal) {
        throw new BadRequestException("正常离店必须选择已授权接送人");
      }
      pickupPersonNameSnapshot = this.requiredText(
        dto.temporaryName,
        "临时或异常接送人姓名不能为空",
      );
      if (!dto.temporaryRelationship) {
        throw new BadRequestException("临时或异常接送人关系不能为空");
      }
      relationshipSnapshot = dto.temporaryRelationship;
      phoneSnapshot = this.requiredText(
        dto.temporaryPhone,
        "临时或异常接送人联系方式不能为空",
      );
    }

    const isException = status !== PickupHandoffStatus.normal;
    const resolution = isException
      ? this.requiredText(
          dto.resolution,
          "临时或异常接送必须记录确认方式和处理结果",
        )
      : this.clean(dto.resolution);
    const exceptionReason =
      status === PickupHandoffStatus.exception
        ? this.requiredText(dto.exceptionReason, "异常接送必须填写异常原因")
        : status === PickupHandoffStatus.temporary_authorization
          ? (this.clean(dto.exceptionReason) ?? "临时接送人")
          : undefined;

    return {
      studentGuardianId,
      pickupPersonId,
      pickupPersonNameSnapshot,
      relationshipSnapshot,
      phoneSnapshot,
      status,
      isException,
      exceptionReason,
      resolution,
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
        class: {
          select: {
            id: true,
            name: true,
            campusId: true,
            campus: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  private async assertTeacherStudents(
    teacherId: string,
    studentIds: string[],
  ): Promise<TeacherStudent[]> {
    const uniqueIds = [...new Set(studentIds)];
    const students = await this.prisma.student.findMany({
      where: {
        id: { in: uniqueIds },
        status: StudentStatus.active,
        class: { teacherId },
      },
      select: {
        id: true,
        name: true,
        classId: true,
        class: {
          select: {
            id: true,
            name: true,
            campusId: true,
            campus: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (students.length !== uniqueIds.length) {
      throw new NotFoundException("部分学生不存在或不属于当前教师班级");
    }
    const byId = new Map(students.map((student) => [student.id, student]));
    return uniqueIds.map((id) => byId.get(id)!);
  }

  private async assertParentStudent(parentId: string, studentId: string) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: { parentId, studentId, status: "active" },
      select: { id: true },
    });
    if (!guardian) throw new NotFoundException("Student not found");
  }

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Student not found");
  }

  private async todayRecordTypes(studentId: string) {
    const records = await this.prisma.pickupRecord.findMany({
      where: { studentId, serviceDate: chinaBusinessDate() },
      select: { type: true },
    });
    return new Set(records.map((record) => record.type));
  }

  private async assertNotAbsentToday(
    studentId: string,
    serviceDate = chinaBusinessDate(),
    client: Pick<Prisma.TransactionClient, "attendanceEvent"> = this.prisma,
  ) {
    const absence = await client.attendanceEvent.findFirst({
      where: {
        studentId,
        type: AttendanceType.absence,
        happenedAt: chinaDayInstantRange(serviceDate),
      },
      select: { id: true },
    });
    if (absence) {
      throw new ConflictException(
        "该学生今天已登记请假/缺勤，不能执行接送操作",
      );
    }
  }

  private assertBatchTransition(
    studentName: string,
    existing: Set<PickupEventType>,
    type: BatchPickupEventType,
  ) {
    if (type === PickupEventType.picked_up_from_school) {
      if (existing.has(PickupEventType.picked_up_from_school)) {
        throw new ConflictException(`${studentName}今天已经登记为已接到`);
      }
      if (
        existing.has(PickupEventType.arrived_at_center) ||
        existing.has(PickupEventType.left_center)
      ) {
        throw new ConflictException(
          `${studentName}今天已经到店，不能补录学校接到`,
        );
      }
      return;
    }

    if (existing.has(PickupEventType.arrived_at_center)) {
      throw new ConflictException(`${studentName}今天已经登记到店`);
    }
    if (existing.has(PickupEventType.left_center)) {
      throw new ConflictException(
        `${studentName}今天已经离店，不能重复登记到店`,
      );
    }
    if (!existing.has(PickupEventType.picked_up_from_school)) {
      throw new BadRequestException(`${studentName}尚未登记学校接到`);
    }
  }

  private rethrowPickupWriteError(error: unknown): never {
    if (
      String(error).includes("ATTENDANCE_PICKUP_CONFLICT") ||
      (error instanceof Error &&
        error.message.includes("ATTENDANCE_PICKUP_CONFLICT"))
    ) {
      throw new ConflictException(
        "该学生今天已登记请假/缺勤，不能执行接送操作",
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("接送节点已经登记，请刷新列表");
    }
    throw error;
  }

  private deriveStudentStatus(
    records: Array<{ type: PickupEventType }>,
    absent: boolean,
  ) {
    const types = new Set(records.map((record) => record.type));
    if (types.has(PickupEventType.left_center)) return "left";
    if (types.has(PickupEventType.arrived_at_center)) return "in_care";
    if (types.has(PickupEventType.picked_up_from_school)) return "picked_up";
    return absent ? "absent" : "waiting_pickup";
  }

  private serviceDateRange(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) return undefined;
    const start = from ? parseBusinessDate(from.slice(0, 10)) : undefined;
    const end = to ? parseBusinessDate(to.slice(0, 10)) : undefined;
    if ((from && !start) || (to && !end)) {
      throw new BadRequestException("日期必须使用 YYYY-MM-DD 格式");
    }
    if (start && end && start > end) {
      throw new BadRequestException("开始日期不能晚于结束日期");
    }
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }

  private parentRecord(record: PickupRecordView) {
    return {
      ...record,
      phoneSnapshot: this.maskPhone(record.phoneSnapshot),
    };
  }

  private attendanceRemark(input: {
    type: PickupEventType;
    arrivalMethod?: PickupArrivalMethod;
    pickupPersonNameSnapshot?: string;
    relationshipSnapshot?: string;
    remark?: string;
  }) {
    const prefix =
      input.type === PickupEventType.arrived_at_center
        ? `安全接送到店（${input.arrivalMethod ?? "unknown"}${
            input.pickupPersonNameSnapshot
              ? `，送达人：${input.relationshipSnapshot ?? ""} ${input.pickupPersonNameSnapshot}`
              : ""
          }）`
        : `安全离店（${input.relationshipSnapshot ?? "接送人"} ${input.pickupPersonNameSnapshot ?? ""}）`;
    return [prefix, input.remark].filter(Boolean).join("；");
  }

  private clean(value?: string | null) {
    const text = value?.trim();
    return text || undefined;
  }

  private requiredText(value: string | undefined, message: string) {
    const text = this.clean(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private maskPhone(value: string | null) {
    if (!value) return null;
    return value.replace(/(\d{3})\d+(\d{4})/, "$1****$2");
  }
}
