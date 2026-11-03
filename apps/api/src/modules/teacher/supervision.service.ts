import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LessonPlanStatus, Prisma } from "@prisma/client";
import { normalizeTeacherPositions } from "../admin/teacher-positions";
import { PrismaService } from "../prisma/prisma.service";
import { SupervisionQueryDto } from "./dto/supervision-query.dto";

const recordInclude = {
  teacher: { select: { id: true, name: true } },
  class: {
    select: {
      id: true,
      name: true,
      campus: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class SupervisionService {
  constructor(private readonly prisma: PrismaService) {}

  private async identity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        employmentStatus: true,
        teacherPositions: true,
        teacherPosition: true,
        managedCampuses: { select: { id: true, name: true } },
      },
    });
    const isSupervisor =
      !!user &&
      user.role === "teacher" &&
      user.status === "active" &&
      user.employmentStatus === "employed" &&
      normalizeTeacherPositions(
        user.teacherPositions,
        user.teacherPosition,
      ).includes("supervisor");
    return {
      isSupervisor,
      campuses: isSupervisor ? user!.managedCampuses : [],
    };
  }

  private async campusIds(userId: string) {
    const context = await this.identity(userId);
    if (!context.isSupervisor)
      throw new ForbiddenException("仅在职校区主管可查看校区教学");
    return context.campuses.map((c) => c.id);
  }

  async context(userId: string) {
    const context = await this.identity(userId);
    const ids = context.campuses.map((c) => c.id);
    if (!context.isSupervisor || !ids.length)
      return { data: { ...context, teachers: [], classes: [] } };
    const [classes, teachers] = await Promise.all([
      this.prisma.class.findMany({
        where: { campusId: { in: ids } },
        select: { id: true, name: true, campusId: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.user.findMany({
        where: {
          role: "teacher",
          OR: [
            { teachingClasses: { some: { campusId: { in: ids } } } },
            { teachingRecords: { some: { class: { campusId: { in: ids } } } } },
            {
              lessonPlans: {
                some: {
                  class: { campusId: { in: ids } },
                  ...this.publicLessons(),
                },
              },
            },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { data: { ...context, classes, teachers } };
  }

  private publicLessons(): Prisma.LessonPlanWhereInput {
    return {
      OR: [
        { status: LessonPlanStatus.published },
        { status: LessonPlanStatus.archived, publishedAt: { not: null } },
      ],
    };
  }

  private async scope(userId: string, query: SupervisionQueryDto) {
    const ids = await this.campusIds(userId);
    if (query.campusId && !ids.includes(query.campusId))
      throw new ForbiddenException("无权查看该校区");
    let date: Prisma.DateTimeFilter | undefined;
    if (query.from || query.to) {
      // Interpret date-only filters as complete days in China, not server local time.
      const parse = (value: string) =>
        new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value,
        );
      const from = query.from ? parse(query.from) : undefined;
      const to = query.to ? parse(query.to) : undefined;
      if (
        (from && !Number.isFinite(from.getTime())) ||
        (to && !Number.isFinite(to.getTime())) ||
        (from && to && from > to)
      )
        throw new BadRequestException("查询日期范围无效");
      date = {
        ...(from ? { gte: from } : {}),
        ...(to
          ? /^\d{4}-\d{2}-\d{2}$/.test(query.to!)
            ? { lt: new Date(to.getTime() + 86400000) }
            : { lte: to }
          : {}),
      };
    }
    return {
      base: {
        class: { campusId: { in: query.campusId ? [query.campusId] : ids } },
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
      },
      date,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async lessonPlans(userId: string, query: SupervisionQueryDto) {
    const { base, date, page, pageSize } = await this.scope(userId, query);
    const where: Prisma.LessonPlanWhereInput = {
      ...base,
      ...this.publicLessons(),
      ...(date ? { lessonDate: date } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lessonPlan.findMany({
        where,
        include: recordInclude,
        orderBy: [{ lessonDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lessonPlan.count({ where }),
    ]);
    const linked = items.length
      ? await this.prisma.teachingRecord.findMany({
          where: {
            class: base.class,
            tags: { hasSome: items.map((item) => `lesson-plan:${item.id}`) },
          },
          select: { teacherId: true, classId: true, tags: true },
        })
      : [];
    return {
      data: {
        items: items.map((item) => ({
          ...item,
          teachingCompleted: linked.some(
            (record) =>
              record.teacherId === item.teacherId &&
              record.classId === item.classId &&
              record.tags.includes(`lesson-plan:${item.id}`),
          ),
        })),
        total,
        page,
        pageSize,
      },
    };
  }

  async teachingRecords(userId: string, query: SupervisionQueryDto) {
    const { base, date, page, pageSize } = await this.scope(userId, query);
    const where: Prisma.TeachingRecordWhereInput = {
      ...base,
      ...(date ? { date } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teachingRecord.findMany({
        where,
        include: recordInclude,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.teachingRecord.count({ where }),
    ]);
    return { data: { items, total, page, pageSize } };
  }

  async detail(userId: string, kind: "lesson" | "record", id: string) {
    const ids = await this.campusIds(userId);
    const base = { id, class: { campusId: { in: ids } } };
    const item =
      kind === "lesson"
        ? await this.prisma.lessonPlan.findFirst({
            where: { ...base, ...this.publicLessons() },
            include: recordInclude,
          })
        : await this.prisma.teachingRecord.findFirst({
            where: base,
            include: recordInclude,
          });
    if (!item) throw new NotFoundException("记录不存在或不在可查看范围内");
    return { data: item };
  }
}
