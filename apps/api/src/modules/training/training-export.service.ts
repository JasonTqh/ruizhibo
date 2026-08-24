import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  Prisma,
  TrainingAssignmentStatus,
  TrainingCourseStatus,
  TrainingPermission,
} from "@prisma/client";
import ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";
import {
  ExportTrainingQueryDto,
  TrainingListQueryDto,
} from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { addNaturalDays, deadlineStatus } from "./training.domain";
import type { TrainingCourseSnapshotPayload } from "./training.types";

@Injectable()
export class TrainingExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
  ) {}

  async assignments(actorId: string, query: ExportTrainingQueryDto) {
    const campusId = await this.authorizedCampusFilter(actorId, query.campusId);
    const now = new Date();
    const currentRounds = query.includeHistory
      ? []
      : await this.prisma.trainingAssignment.groupBy({
          by: ["teacherId"],
          where: { campusId },
          _max: { roundNumber: true },
        });
    const where: Prisma.TrainingAssignmentWhereInput = {
      campusId,
      teacherId: query.teacherId,
      OR: query.includeHistory
        ? undefined
        : currentRounds.map((item) => ({
            teacherId: item.teacherId,
            roundNumber: item._max.roundNumber ?? -1,
          })),
      status: query.status,
      mentorId: query.mentorId,
      teacher: {
        name: query.teacherName
          ? { contains: query.teacherName, mode: "insensitive" }
          : undefined,
        safetyCredentials: query.safetyStatus
          ? { some: { status: query.safetyStatus } }
          : undefined,
      },
      dueAt: this.deadlineWhere(query.deadlineStatus, now),
    };
    const assignments = await this.prisma.trainingAssignment.findMany({
      where,
      orderBy: [{ teacher: { name: "asc" } }, { roundNumber: "desc" }],
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            phone: true,
            safetyCredentials: {
              select: { status: true, validUntil: true },
              take: 1,
            },
          },
        },
        campus: { select: { name: true } },
        mentor: { select: { name: true } },
        courses: {
          orderBy: { sortOrder: "asc" },
          include: {
            snapshot: true,
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              include: {
                chapterProgress: true,
                quizAttempts: { orderBy: { submittedAt: "desc" }, take: 1 },
                practicalChecks: { orderBy: { createdAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });

    const workbook = this.workbook("培训概览");
    const sheet = workbook.worksheets[0];
    sheet.columns = [
      { header: "教师", key: "teacher", width: 16 },
      { header: "手机号", key: "phone", width: 16 },
      { header: "校区", key: "campus", width: 20 },
      { header: "培训轮次", key: "round", width: 12 },
      { header: "培训状态", key: "assignmentStatus", width: 14 },
      { header: "课程", key: "course", width: 20 },
      { header: "课程状态", key: "courseStatus", width: 14 },
      { header: "进度", key: "progress", width: 28 },
      { header: "成绩", key: "score", width: 12 },
      { header: "实操状态", key: "practical", width: 14 },
      { header: "安全状态", key: "safety", width: 16 },
      { header: "安全有效期", key: "safetyUntil", width: 20 },
      { header: "布置日期", key: "assignedAt", width: 20 },
      { header: "截止日期", key: "dueAt", width: 20 },
      { header: "期限状态", key: "deadline", width: 14 },
      { header: "带教负责人", key: "mentor", width: 16 },
      { header: "最近学习时间", key: "lastLearningAt", width: 20 },
    ];
    for (const assignment of assignments) {
      for (const course of assignment.courses) {
        const attempt = course.attempts[0];
        const payload = course.snapshot
          .payload as unknown as TrainingCourseSnapshotPayload;
        const chaptersCompleted =
          attempt?.chapterProgress.filter((item) => item.completedAt).length ?? 0;
        const totalChapters = payload.chapters.length;
        const studyMinutes = Math.floor((attempt?.accumulatedSeconds ?? 0) / 60);
        const safety = assignment.teacher.safetyCredentials[0];
        sheet.addRow({
          teacher: safeCell(assignment.teacher.name),
          phone: safeCell(assignment.teacher.phone ?? ""),
          campus: safeCell(assignment.campus.name),
          round: assignment.roundNumber,
          assignmentStatus: assignmentStatusLabel[assignment.status],
          course: safeCell(course.snapshot.courseName),
          courseStatus: courseStatusLabel[course.status],
          progress: `${chaptersCompleted}/${totalChapters}章；${studyMinutes}/${course.snapshot.minimumMinutes}分钟`,
          score: attempt?.quizAttempts[0]?.score ?? "—",
          practical: course.snapshot.requiresPractical
            ? practicalLabel[attempt?.practicalChecks[0]?.conclusion ?? "pending"]
            : "不适用",
          safety: safetyStatusLabel[safety?.status ?? "not_obtained"],
          safetyUntil: formatDate(safety?.validUntil),
          assignedAt: formatDate(assignment.assignedAt),
          dueAt: formatDate(assignment.dueAt),
          deadline: deadlineLabel[deadlineStatus(now, assignment.dueAt)],
          mentor: safeCell(assignment.mentor?.name ?? "—"),
          lastLearningAt: formatDate(course.lastLearningAt),
        });
      }
    }
    this.formatSheet(sheet);
    return this.fileResult(workbook, "教师培训概览");
  }

  async feedback(actorId: string, query: TrainingListQueryDto) {
    const campusId = await this.authorizedCampusFilter(actorId, query.campusId);
    const records = await this.prisma.trainingFeedback.findMany({
      where: {
        assignment: {
          campusId,
          teacherId: query.teacherId,
          teacher: query.teacherName
            ? { name: { contains: query.teacherName, mode: "insensitive" } }
            : undefined,
        },
      },
      orderBy: { submittedAt: "desc" },
      include: {
        teacher: { select: { name: true, phone: true } },
        assignment: {
          include: { campus: { select: { name: true } } },
        },
      },
    });
    const workbook = this.workbook("培训反馈");
    const sheet = workbook.worksheets[0];
    sheet.columns = [
      { header: "教师", key: "teacher", width: 16 },
      { header: "手机号", key: "phone", width: 16 },
      { header: "校区", key: "campus", width: 20 },
      { header: "培训轮次", key: "round", width: 12 },
      { header: "评分", key: "rating", width: 10 },
      { header: "培训感悟", key: "reflection", width: 45 },
      { header: "改进建议", key: "suggestion", width: 45 },
      { header: "提交时间", key: "submittedAt", width: 20 },
    ];
    for (const item of records) {
      sheet.addRow({
        teacher: safeCell(item.teacher.name),
        phone: safeCell(item.teacher.phone ?? ""),
        campus: safeCell(item.assignment.campus.name),
        round: item.assignment.roundNumber,
        rating: item.rating,
        reflection: safeCell(item.reflection ?? ""),
        suggestion: safeCell(item.suggestion ?? ""),
        submittedAt: formatDate(item.submittedAt),
      });
    }
    this.formatSheet(sheet);
    return this.fileResult(workbook, "教师培训反馈");
  }

  private workbook(name: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "锐之博教师学院";
    workbook.created = new Date();
    workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    return workbook;
  }

  private formatSheet(sheet: ExcelJS.Worksheet) {
    sheet.autoFilter = { from: "A1", to: `${columnName(sheet.columnCount)}1` };
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F8064" },
    };
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  }

  private async fileResult(workbook: ExcelJS.Workbook, prefix: string) {
    const value = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return { buffer: Buffer.from(value), fileName: `${prefix}-${stamp}.xlsx` };
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

  private deadlineWhere(value: string | undefined, now: Date) {
    if (!value) return undefined;
    if (value === "overdue") return { lt: now };
    if (value === "due_soon") return { gte: now, lte: addNaturalDays(now, 3) };
    if (value === "normal") return { gt: addNaturalDays(now, 3) };
    throw new BadRequestException("期限状态无效");
  }
}

const assignmentStatusLabel: Record<TrainingAssignmentStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  frozen: "已冻结",
  terminated: "已终止",
};

const courseStatusLabel: Record<TrainingCourseStatus, string> = {
  locked: "未解锁",
  available: "可学习",
  in_progress: "学习中",
  awaiting_practical: "待实操确认",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  exempted: "已免修",
};

const practicalLabel: Record<string, string> = {
  pending: "待确认",
  passed: "通过",
  retraining_required: "需复训",
};

const safetyStatusLabel: Record<string, string> = {
  not_obtained: "未取得",
  awaiting_confirmation: "待确认",
  valid: "有效",
  expiring: "即将到期",
  retraining_required: "需复训",
};

const deadlineLabel = {
  normal: "正常",
  due_soon: "即将到期",
  overdue: "已逾期",
};

function safeCell(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function columnName(count: number) {
  let result = "";
  let current = count;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}
