import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TrainingContentStatus,
  TrainingMediaType,
  TrainingPermission,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertTrainingCourseDto } from "./dto/training-admin.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";
import type {
  TrainingCourseSnapshotPayload,
  TrainingSnapshotQuestionOption,
} from "./training.types";

const courseInclude = {
  coverAsset: {
    select: { id: true, url: true, mimeType: true, scene: true },
  },
  chapters: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      media: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          fileAsset: {
            select: {
              id: true,
              url: true,
              mimeType: true,
              scene: true,
              size: true,
            },
          },
        },
      },
    },
  },
  quiz: {
    include: { questions: { orderBy: { sortOrder: "asc" as const } } },
  },
  practicalItems: { orderBy: { sortOrder: "asc" as const } },
  _count: { select: { snapshots: true, assignmentCourses: true } },
} satisfies Prisma.TrainingCourseInclude;

@Injectable()
export class TrainingCourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
  ) {}

  async listAdmin(actorId: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const courses = await this.prisma.trainingCourse.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: courseInclude,
    });
    return { data: courses };
  }

  async getAdmin(actorId: string, courseId: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    return { data: await this.requireCourse(courseId) };
  }

  async create(actorId: string, dto: UpsertTrainingCourseDto) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    await this.validateAggregate(dto);
    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trainingCourse.create({
        data: this.courseCreateData(actorId, dto),
        include: courseInclude,
      });
      await this.audit.log(
        {
          actorId,
          action: "course.create",
          targetType: "TrainingCourse",
          targetId: created.id,
          after: this.auditCourse(created),
          reason: dto.reason.trim(),
        },
        tx,
      );
      return created;
    });
    return { data: course };
  }

  async update(
    actorId: string,
    courseId: string,
    dto: UpsertTrainingCourseDto,
  ) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    await this.validateAggregate(dto);
    const current = await this.requireCourse(courseId);
    if (dto.code.trim() !== current.code) {
      throw new BadRequestException("课程代码是稳定业务标识，创建后不能修改");
    }
    this.assertFixedCourseRule(current.code, dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.trainingQuiz.deleteMany({ where: { courseId } });
      await tx.trainingPracticalTemplateItem.deleteMany({
        where: { courseId },
      });
      await tx.trainingChapter.deleteMany({ where: { courseId } });
      const course = await tx.trainingCourse.update({
        where: { id: courseId },
        data: this.courseUpdateData(actorId, dto),
        include: courseInclude,
      });
      await this.audit.log(
        {
          actorId,
          action: "course.update",
          targetType: "TrainingCourse",
          targetId: courseId,
          before: this.auditCourse(current),
          after: this.auditCourse(course),
          reason: dto.reason.trim(),
        },
        tx,
      );
      return course;
    });
    return { data: updated };
  }

  async removeDraft(actorId: string, courseId: string, reason: string) {
    await this.access.assertPermission(
      actorId,
      TrainingPermission.training_manage,
    );
    const current = await this.requireCourse(courseId);
    if (current.status !== TrainingContentStatus.draft) {
      throw new ConflictException("只有从未使用的草稿课程可以删除；其他课程请停用");
    }
    if (current._count.snapshots > 0 || current._count.assignmentCourses > 0) {
      throw new ConflictException("课程已有培训快照或任务引用，只能停用");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.trainingCourse.delete({ where: { id: courseId } });
      await this.audit.log(
        {
          actorId,
          action: "course.delete_draft",
          targetType: "TrainingCourse",
          targetId: courseId,
          before: this.auditCourse(current),
          reason: reason.trim(),
        },
        tx,
      );
    });
    return { data: { id: courseId } };
  }

  async listEnabledForLibrary(search?: string) {
    return this.prisma.trainingCourse.findMany({
      where: {
        status: TrainingContentStatus.enabled,
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              { summary: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: courseInclude,
    });
  }

  async createSnapshot(tx: Prisma.TransactionClient, courseId: string) {
    const course = await tx.trainingCourse.findUnique({
      where: { id: courseId },
      include: courseInclude,
    });
    if (!course || course.status !== TrainingContentStatus.enabled) {
      throw new ConflictException("培训计划包含未启用课程，暂时不能布置");
    }
    const payload = this.toSnapshotPayload(course);
    const checksum = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return tx.trainingCourseSnapshot.create({
      data: {
        originalCourseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        category: course.category,
        minimumMinutes: course.minimumMinutes,
        requiresPractical: course.requiresPractical,
        isSafety: course.isSafety,
        checksum,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async validateAggregate(dto: UpsertTrainingCourseDto) {
    if (dto.minimumMinutes > dto.expectedMinutes) {
      throw new BadRequestException("最低学习时长不能大于预计学习时长");
    }
    if (dto.isRequired && dto.minimumMinutes < 1) {
      throw new BadRequestException("必修课程必须配置大于0分钟的最低学习时长");
    }
    if (!dto.chapters.some((chapter) => chapter.isEnabled !== false)) {
      throw new BadRequestException("课程至少需要一个已启用章节");
    }
    this.assertUniqueOrder(dto.chapters, "章节");
    this.assertUniqueOrder(dto.practicalItems, "实操项目");
    for (const chapter of dto.chapters) {
      this.assertUniqueOrder(chapter.media, "章节媒体");
      const videos = chapter.media.filter(
        (media) => media.type === TrainingMediaType.video,
      );
      if (videos.length > 1) {
        throw new BadRequestException("同一章节最多配置一个MP4视频");
      }
      if (videos.some((media) => !media.durationSeconds)) {
        throw new BadRequestException("MP4视频必须配置准确的视频时长");
      }
    }
    if (dto.quiz) {
      this.assertUniqueOrder(dto.quiz.questions, "题目");
      for (const question of dto.quiz.questions) {
        const optionIds = question.options.map((option) => option.id);
        if (new Set(optionIds).size !== optionIds.length) {
          throw new BadRequestException("同一道题的选项标识不能重复");
        }
        if (
          question.correctAnswers.some((answer) => !optionIds.includes(answer))
        ) {
          throw new BadRequestException("正确答案必须来自该题的选项");
        }
        if (
          question.type !== "multiple_choice" &&
          question.correctAnswers.length !== 1
        ) {
          throw new BadRequestException("单选题和判断题只能配置一个正确答案");
        }
        if (
          question.type === "multiple_choice" &&
          question.correctAnswers.length < 2
        ) {
          throw new BadRequestException("多选题至少需要配置两个正确答案");
        }
        if (
          question.type === "true_false" &&
          (optionIds.length !== 2 ||
            !optionIds.includes("true") ||
            !optionIds.includes("false"))
        ) {
          throw new BadRequestException(
            "判断题选项标识必须且只能为 true 和 false",
          );
        }
      }
    }
    if (dto.isRequired && dto.status === TrainingContentStatus.enabled && !dto.quiz) {
      throw new BadRequestException("启用的必修课程必须配置测验");
    }
    if (dto.requiresPractical && dto.practicalItems.length === 0) {
      throw new BadRequestException("要求实操的课程必须配置检查清单");
    }
    if (dto.isSafety && !dto.requiresPractical) {
      throw new BadRequestException("安全课程必须包含实操检查");
    }
    await this.assertAssets(dto);
  }

  private assertFixedCourseRule(code: string, dto: UpsertTrainingCourseDto) {
    const fixedRules = new Map<string, { practical: boolean; safety: boolean }>([
      ["ONBOARDING-CULTURE", { practical: false, safety: false }],
      ["ONBOARDING-COMPENSATION", { practical: false, safety: false }],
      ["ONBOARDING-GROWTH", { practical: false, safety: false }],
      ["ONBOARDING-CLASS-FLOW", { practical: true, safety: false }],
      ["ONBOARDING-CLASSROOM", { practical: true, safety: false }],
      ["ONBOARDING-FAMILY", { practical: true, safety: false }],
      ["ONBOARDING-SAFETY", { practical: true, safety: true }],
    ]);
    const rule = fixedRules.get(code);
    if (!rule) return;
    if (
      !dto.isRequired ||
      dto.requiresPractical !== rule.practical ||
      dto.isSafety !== rule.safety
    ) {
      throw new BadRequestException(
        "固定7门新教师课程的必修、实操和安全属性不能改变",
      );
    }
  }

  private async assertAssets(dto: UpsertTrainingCourseDto) {
    const usages = [
      ...(dto.coverAssetId
        ? [{ id: dto.coverAssetId, type: TrainingMediaType.image }]
        : []),
      ...dto.chapters.flatMap((chapter) =>
        chapter.media.map((media) => ({
          id: media.fileAssetId,
          type: media.type,
        })),
      ),
    ];
    if (!usages.length) return;
    const assets = await this.prisma.fileAsset.findMany({
      where: { id: { in: [...new Set(usages.map((item) => item.id))] } },
      select: { id: true, mimeType: true, scene: true },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const usage of usages) {
      const asset = byId.get(usage.id);
      if (!asset || !asset.scene?.startsWith("training")) {
        throw new BadRequestException("课程媒体必须使用培训专用上传场景");
      }
      if (
        (usage.type === TrainingMediaType.image &&
          !asset.mimeType.startsWith("image/")) ||
        (usage.type === TrainingMediaType.video &&
          asset.mimeType !== "video/mp4")
      ) {
        throw new BadRequestException("课程媒体类型与文件内容不一致");
      }
    }
  }

  private courseCreateData(actorId: string, dto: UpsertTrainingCourseDto) {
    return {
      ...this.courseScalars(dto),
      createdById: actorId,
      updatedById: actorId,
      ...this.nestedCreate(dto),
    } satisfies Prisma.TrainingCourseUncheckedCreateInput;
  }

  private courseUpdateData(actorId: string, dto: UpsertTrainingCourseDto) {
    return {
      ...this.courseScalars(dto),
      updatedById: actorId,
      ...this.nestedCreate(dto),
    } satisfies Prisma.TrainingCourseUncheckedUpdateInput;
  }

  private courseScalars(dto: UpsertTrainingCourseDto) {
    return {
      code: dto.code.trim(),
      name: dto.name.trim(),
      category: dto.category,
      summary: dto.summary.trim(),
      audience: dto.audience?.trim() || null,
      expectedMinutes: dto.expectedMinutes,
      minimumMinutes: dto.minimumMinutes,
      sortOrder: dto.sortOrder,
      isRequired: dto.isRequired,
      requiresPractical: dto.requiresPractical,
      isSafety: dto.isSafety,
      coverAssetId: dto.coverAssetId || null,
      status: dto.status,
    };
  }

  private nestedCreate(dto: UpsertTrainingCourseDto) {
    return {
      chapters: {
        create: dto.chapters.map((chapter) => ({
          title: chapter.title.trim(),
          contentHtml: sanitizeTrainingHtml(chapter.contentHtml),
          sortOrder: chapter.sortOrder,
          isEnabled: chapter.isEnabled ?? true,
          media: {
            create: chapter.media.map((media) => ({
              fileAssetId: media.fileAssetId,
              type: media.type,
              caption: media.caption?.trim() || null,
              sortOrder: media.sortOrder,
              durationSeconds: media.durationSeconds ?? null,
            })),
          },
        })),
      },
      quiz: dto.quiz
        ? {
            create: {
              passScore: dto.quiz.passScore,
              maxAttempts: dto.quiz.maxAttempts ?? null,
              questions: {
                create: dto.quiz.questions.map((question) => ({
                  type: question.type,
                  prompt: question.prompt.trim(),
                  options: question.options as unknown as Prisma.InputJsonValue,
                  correctAnswers: question.correctAnswers,
                  score: question.score,
                  explanation: question.explanation?.trim() || null,
                  sortOrder: question.sortOrder,
                })),
              },
            },
          }
        : undefined,
      practicalItems: {
        create: dto.practicalItems.map((item) => ({
          title: item.title.trim(),
          instructions: item.instructions?.trim() || null,
          isRequired: item.isRequired ?? true,
          sortOrder: item.sortOrder,
        })),
      },
    };
  }

  private toSnapshotPayload(
    course: Prisma.TrainingCourseGetPayload<{ include: typeof courseInclude }>,
  ): TrainingCourseSnapshotPayload {
    return {
      schemaVersion: 1,
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        category: course.category,
        summary: course.summary,
        audience: course.audience,
        expectedMinutes: course.expectedMinutes,
        minimumMinutes: course.minimumMinutes,
        sortOrder: course.sortOrder,
        requiresPractical: course.requiresPractical,
        isSafety: course.isSafety,
        coverAssetId: course.coverAssetId,
      },
      chapters: course.chapters
        .filter((chapter) => chapter.isEnabled)
        .map((chapter) => ({
          key: chapter.id,
          title: chapter.title,
          contentHtml: chapter.contentHtml,
          sortOrder: chapter.sortOrder,
          media: chapter.media.map((media) => ({
            id: media.id,
            type: media.type,
            fileAssetId: media.fileAssetId,
            caption: media.caption,
            sortOrder: media.sortOrder,
            durationSeconds: media.durationSeconds,
          })),
        })),
      quiz: course.quiz
        ? {
            passScore: course.quiz.passScore,
            maxAttempts: course.quiz.maxAttempts,
            questions: course.quiz.questions.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              options: question.options as unknown as TrainingSnapshotQuestionOption[],
              correctAnswers: question.correctAnswers,
              score: question.score,
              explanation: question.explanation,
              sortOrder: question.sortOrder,
            })),
          }
        : null,
      practicalItems: course.practicalItems.map((item) => ({
        id: item.id,
        title: item.title,
        instructions: item.instructions,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
      })),
    };
  }

  private requireCourse(courseId: string) {
    return this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: courseInclude,
    }).then((course) => {
      if (!course) throw new NotFoundException("培训课程不存在");
      return course;
    });
  }

  private assertUniqueOrder(items: Array<{ sortOrder: number }>, label: string) {
    const orders = items.map((item) => item.sortOrder);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException(`${label}排序不能重复`);
    }
  }

  private auditCourse(
    course: Prisma.TrainingCourseGetPayload<{ include: typeof courseInclude }>,
  ): Prisma.InputJsonValue {
    return {
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        category: course.category,
        summary: course.summary,
        audience: course.audience,
        expectedMinutes: course.expectedMinutes,
        minimumMinutes: course.minimumMinutes,
        sortOrder: course.sortOrder,
        isRequired: course.isRequired,
        requiresPractical: course.requiresPractical,
        isSafety: course.isSafety,
        coverAssetId: course.coverAssetId,
        status: course.status,
      },
      chapters: course.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        contentHtml: chapter.contentHtml,
        sortOrder: chapter.sortOrder,
        isEnabled: chapter.isEnabled,
        media: chapter.media.map((media) => ({
          id: media.id,
          fileAssetId: media.fileAssetId,
          type: media.type,
          caption: media.caption,
          durationSeconds: media.durationSeconds,
          sortOrder: media.sortOrder,
        })),
      })),
      quiz: course.quiz
        ? {
            passScore: course.quiz.passScore,
            maxAttempts: course.quiz.maxAttempts,
            questions: course.quiz.questions.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              options: question.options,
              correctAnswers: question.correctAnswers,
              score: question.score,
              explanation: question.explanation,
              sortOrder: question.sortOrder,
            })),
          }
        : null,
      practicalItems: course.practicalItems.map((item) => ({
        id: item.id,
        title: item.title,
        instructions: item.instructions,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
      })),
    };
  }
}

export function sanitizeTrainingHtml(value: string) {
  const document = parseDocument(value, {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  });
  return document.children.map(renderSafeHtmlNode).join("").trim();
}

const allowedTrainingHtmlTags = new Set([
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "code",
  "pre",
  "a",
]);

const droppedTrainingHtmlTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "svg",
  "math",
  "img",
  "video",
  "audio",
  "source",
]);

const voidTrainingHtmlTags = new Set(["br", "hr"]);

function renderSafeHtmlNode(node: any): string {
  if (node.type === "text") return escapeHtml(node.data ?? "");
  if (node.type === "comment" || node.type === "directive") return "";
  const name = String(node.name ?? "").toLowerCase();
  if (droppedTrainingHtmlTags.has(name)) return "";
  const children = Array.isArray(node.children)
    ? node.children.map(renderSafeHtmlNode).join("")
    : "";
  if (!allowedTrainingHtmlTags.has(name)) return children;
  const attributes = safeTrainingAttributes(name, node.attribs ?? {});
  if (voidTrainingHtmlTags.has(name)) return `<${name}${attributes}>`;
  return `<${name}${attributes}>${children}</${name}>`;
}

function safeTrainingAttributes(
  tag: string,
  attributes: Record<string, string>,
) {
  const result: string[] = [];
  if (tag === "a" && attributes.href) {
    const href = attributes.href.trim();
    if (/^(https?:|mailto:)/i.test(href)) {
      result.push(`href="${escapeHtmlAttribute(href)}"`);
      result.push('rel="noopener noreferrer"');
    }
  }
  if (["td", "th"].includes(tag)) {
    for (const key of ["colspan", "rowspan"] as const) {
      const value = attributes[key];
      if (/^[1-9]\d{0,2}$/.test(value ?? "")) {
        result.push(`${key}="${value}"`);
      }
    }
  }
  if (tag === "ol" && /^\d{1,4}$/.test(attributes.start ?? "")) {
    result.push(`start="${attributes.start}"`);
  }
  return result.length ? ` ${result.join(" ")}` : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
