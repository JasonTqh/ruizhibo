import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  TrainingContentStatus,
  TrainingPermission,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { extname } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { UploadFileDto } from "./dto/upload-file.dto";
import { FILE_STORAGE, type FileStorage } from "./storage/file-storage";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export const TRAINING_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const TRAINING_VIDEO_MIME_TYPE = "video/mp4";

export interface UploadedTrainingFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(ownerId: string, dto: UploadFileDto) {
    if (!allowedMimeTypes.has(dto.mimeType)) {
      throw new BadRequestException(
        "仅支持 JPG、PNG、WebP、GIF 图片或 PDF 文件",
      );
    }

    const buffer = Buffer.from(dto.base64, "base64");
    if (dto.size && dto.size !== buffer.length) {
      throw new BadRequestException("文件大小与上传内容不一致");
    }
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException("单个文件不能超过 10 MB");
    }
    if (!this.matchesMimeType(buffer, dto.mimeType)) {
      throw new BadRequestException("文件内容与声明类型不一致");
    }

    const scene = this.safeSegment(dto.scene ?? "general");
    if (scene === "training" || scene.startsWith("training-")) {
      throw new BadRequestException("培训素材必须使用受保护的培训上传接口");
    }
    const extension = this.resolveExtension(dto.fileName, dto.mimeType);
    const key = `${scene}/${randomUUID()}${extension}`;
    const stored = await this.storage.put({
      key,
      body: buffer,
      mimeType: dto.mimeType,
    });

    try {
      const asset = await this.prisma.fileAsset.create({
        data: {
          url: stored.url,
          mimeType: dto.mimeType,
          size: buffer.length,
          ownerId,
          scene,
          storageDriver: stored.driver,
          storageKey: stored.key,
        },
      });

      return { data: asset };
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async trainingLimits(ownerId: string) {
    await this.assertCourseManager(ownerId);
    return {
      data: {
        imageMaxBytes: trainingImageMaxBytes(),
        videoMaxBytes: trainingVideoMaxBytes(),
        imageMimeTypes: [...TRAINING_IMAGE_MIME_TYPES],
        videoMimeTypes: [TRAINING_VIDEO_MIME_TYPE],
        videoCodecs: ["H.264", "AAC"],
        accessUrlMaxSeconds: trainingMediaUrlSeconds(),
      },
    };
  }

  async uploadTraining(ownerId: string, file?: UploadedTrainingFile) {
    await this.assertCourseManager(ownerId);
    if (!file) throw new BadRequestException("请选择培训图片或MP4视频");
    try {
      const isImage = TRAINING_IMAGE_MIME_TYPES.has(file.mimetype);
      const isVideo = file.mimetype === TRAINING_VIDEO_MIME_TYPE;
      if (!isImage && !isVideo) {
        throw new BadRequestException("培训素材仅支持 JPG、PNG、WebP 或 MP4");
      }
      const limit = isVideo ? trainingVideoMaxBytes() : trainingImageMaxBytes();
      if (file.size <= 0 || file.size > limit) {
        throw new BadRequestException(
          `${isVideo ? "MP4" : "图片"}文件不能超过 ${Math.floor(limit / 1024 / 1024)} MB`,
        );
      }
      await this.validateTrainingFile(file, isVideo);
      const extension = this.resolveTrainingExtension(file.originalname, file.mimetype);
      const key = `training-course/${randomUUID()}${extension}`;
      const stored = await this.storage.putFile({
        key,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype,
      });
      try {
        const asset = await this.prisma.fileAsset.create({
          data: {
            url: `protected://training/${stored.key}`,
            mimeType: file.mimetype,
            size: file.size,
            ownerId,
            scene: "training-course",
            storageDriver: stored.driver,
            storageKey: stored.key,
          },
        });
        return { data: asset };
      } catch (error) {
        await this.storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async createTrainingAccessUrl(requesterId: string, assetId: string) {
    const asset = await this.requireTrainingAsset(assetId);
    await this.assertTrainingAssetAccess(requesterId, assetId);
    const expires = Math.floor(Date.now() / 1000) + trainingMediaUrlSeconds();
    const nonce = randomUUID();
    const signature = this.signTrainingMedia(
      assetId,
      expires,
      requesterId,
      nonce,
    );
    return {
      data: {
        assetId,
        mimeType: asset.mimeType,
        expiresAt: new Date(expires * 1000),
        url: `/api/files/training/${assetId}/content?actorId=${encodeURIComponent(requesterId)}&expires=${expires}&nonce=${nonce}&signature=${signature}`,
      },
    };
  }

  async openTrainingAsset(
    assetId: string,
    actorId: string,
    expiresValue: string,
    nonce: string,
    signature: string,
    rangeHeader?: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(actorId)) {
      throw new ForbiddenException("培训素材访问地址无效或已过期");
    }
    const expires = Number(expiresValue);
    if (!/^[0-9a-f-]{36}$/i.test(nonce)) {
      throw new ForbiddenException("培训素材访问地址无效或已过期");
    }
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(expires) ||
      expires <= now ||
      expires - now > 30 * 60 ||
      !this.safeSignature(
        signature,
        this.signTrainingMedia(assetId, expires, actorId, nonce),
      )
    ) {
      throw new ForbiddenException("培训素材访问地址无效或已过期");
    }
    const asset = await this.requireTrainingAsset(assetId);
    if (!asset.storageKey) {
      throw new ServiceUnavailableException("培训素材缺少存储标识");
    }
    const range = parseByteRange(rangeHeader, asset.size ?? undefined);
    const opened = await this.storage.open({
      key: asset.storageKey,
      start: range?.start,
      end: range?.end,
    });
    return { asset, opened, range };
  }

  private safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "general";
  }

  private async assertCourseManager(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.admin, status: UserStatus.active },
      select: { id: true },
    });
    const grant = user
      ? await this.prisma.trainingPermissionGrant.findFirst({
          where: {
            userId,
            permission: TrainingPermission.training_manage,
            scopeKey: "GLOBAL",
            isActive: true,
          },
          select: { id: true },
        })
      : null;
    if (!grant) throw new ForbiddenException("没有培训课程维护权限");
  }

  private async assertTrainingAssetAccess(userId: string, assetId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.active },
      select: { role: true },
    });
    if (!user) throw new ForbiddenException("账号不可用");
    if (user.role === UserRole.admin) {
      await this.assertCourseManager(userId);
      return;
    }
    if (user.role !== UserRole.teacher) {
      throw new ForbiddenException("培训素材仅供教师与授权管理员访问");
    }

    const activeAssignments = await this.prisma.trainingAssignment.findMany({
      where: {
        teacherId: userId,
        activeSlot: userId,
        campus: { trainingFeatureFlag: { enabled: true } },
      },
      select: {
        courses: {
          where: { status: { not: "locked" } },
          select: { snapshot: { select: { payload: true } } },
        },
      },
    });
    if (
      activeAssignments.some((assignment) =>
        assignment.courses.some((course) =>
          jsonContainsExactValue(course.snapshot.payload, assetId),
        ),
      )
    ) {
      return;
    }

    const enabledCampus = await this.prisma.campus.count({
      where: {
        trainingFeatureFlag: { enabled: true },
        OR: [
          { classes: { some: { teacherId: userId } } },
          { trainingAssignments: { some: { teacherId: userId } } },
        ],
      },
    });
    if (!enabledCampus) throw new ForbiddenException("所属校区暂未开放教师学院");
    const references = await this.prisma.fileAsset.findUnique({
      where: { id: assetId },
      select: {
        trainingCourseCovers: {
          where: { status: TrainingContentStatus.enabled },
          select: { id: true },
        },
        trainingChapterMedia: {
          where: {
            chapter: { course: { status: TrainingContentStatus.enabled } },
          },
          select: { chapter: { select: { courseId: true } } },
        },
      },
    });
    const referencedCourseIds = [
      ...new Set([
        ...(references?.trainingCourseCovers.map((course) => course.id) ?? []),
        ...(references?.trainingChapterMedia.map(
          (media) => media.chapter.courseId,
        ) ?? []),
      ]),
    ];
    if (!referencedCourseIds.length) {
      throw new ForbiddenException("无权访问该培训素材");
    }
    const lockedFormalCourses =
      await this.prisma.trainingAssignmentCourse.findMany({
        where: {
          originalCourseId: { in: referencedCourseIds },
          status: "locked",
          assignment: { teacherId: userId, activeSlot: userId },
        },
        select: { originalCourseId: true },
      });
    const lockedIds = new Set(
      lockedFormalCourses
        .map((course) => course.originalCourseId)
        .filter((courseId): courseId is string => Boolean(courseId)),
    );
    if (referencedCourseIds.every((courseId) => lockedIds.has(courseId))) {
      throw new ForbiddenException("请先完成上一门课程后再访问该培训素材");
    }
  }

  private requireTrainingAsset(assetId: string) {
    return this.prisma.fileAsset.findFirst({
      where: { id: assetId, scene: { startsWith: "training" } },
    }).then((asset) => {
      if (!asset) throw new NotFoundException("培训素材不存在");
      return asset;
    });
  }

  private signTrainingMedia(
    assetId: string,
    expires: number,
    actorId: string,
    nonce: string,
  ) {
    const secret =
      process.env.TRAINING_MEDIA_SIGNING_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException("素材签名密钥未配置或不安全");
    }
    const production = process.env.NODE_ENV === "production";
    if (
      production &&
      process.env.TRAINING_MEDIA_SIGNING_SECRET?.trim() !== secret
    ) {
      throw new ServiceUnavailableException("训练媒体签名密钥必须独立配置");
    }
    if (
      process.env.JWT_SECRET?.trim() &&
      production &&
      secret === process.env.JWT_SECRET?.trim()
    ) {
      throw new ServiceUnavailableException(
        "训练媒体签名密钥不能与 JWT 密钥复用",
      );
    }
    return createHmac("sha256", secret)
      .update(`${assetId}|${expires}|${actorId}|${nonce}`)
      .digest("base64url");
  }

  private safeSignature(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async validateTrainingFile(file: UploadedTrainingFile, video: boolean) {
    const handle = await open(file.path, "r");
    try {
      const header = Buffer.alloc(Math.min(file.size, 32));
      await handle.read(header, 0, header.length, 0);
      if (!video) {
        if (!this.matchesMimeType(header, file.mimetype)) {
          throw new BadRequestException("图片内容与文件类型不一致");
        }
        return;
      }
      if (header.length < 12 || header.subarray(4, 8).toString("ascii") !== "ftyp") {
        throw new BadRequestException("文件不是有效的MP4容器");
      }
    } finally {
      await handle.close();
    }

    let h264 = false;
    let aac = false;
    let overlap = Buffer.alloc(0);
    for await (const chunkValue of createReadStream(file.path)) {
      const chunk = Buffer.concat([overlap, Buffer.from(chunkValue)]);
      const text = chunk.toString("latin1");
      h264 ||= text.includes("avc1") || text.includes("avc3");
      aac ||= text.includes("mp4a");
      if (h264 && aac) break;
      overlap = chunk.subarray(Math.max(0, chunk.length - 3));
    }
    if (!h264 || !aac) {
      throw new BadRequestException("MP4必须采用H.264视频和AAC音频编码");
    }
  }

  private resolveTrainingExtension(fileName: string, mimeType: string) {
    const extension = extname(fileName).toLowerCase();
    if (mimeType === TRAINING_VIDEO_MIME_TYPE) return ".mp4";
    if (mimeType === "image/jpeg") return [".jpg", ".jpeg"].includes(extension) ? extension : ".jpg";
    if (mimeType === "image/png") return ".png";
    return ".webp";
  }

  private resolveExtension(fileName: string, mimeType: string) {
    const fromName = extname(fileName).toLowerCase();
    const matchingExtensions: Record<string, string[]> = {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
      "application/pdf": [".pdf"],
    };
    if (matchingExtensions[mimeType]?.includes(fromName)) {
      return fromName;
    }

    switch (mimeType) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      case "image/gif":
        return ".gif";
      case "application/pdf":
        return ".pdf";
      default:
        return ".bin";
    }
  }

  private matchesMimeType(buffer: Buffer, mimeType: string) {
    if (mimeType === "image/jpeg") {
      return (
        buffer.length >= 3 &&
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      );
    }
    if (mimeType === "image/png") {
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }
    if (mimeType === "image/gif") {
      const signature = buffer.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    }
    if (mimeType === "image/webp") {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    }
    if (mimeType === "application/pdf") {
      return (
        buffer.length >= 5 &&
        buffer.subarray(0, 5).toString("ascii") === "%PDF-"
      );
    }
    return false;
  }
}

export function trainingImageMaxBytes() {
  return configuredMegabytes("TRAINING_IMAGE_MAX_MB", 10) * 1024 * 1024;
}

export function trainingVideoMaxBytes() {
  return configuredMegabytes("TRAINING_VIDEO_MAX_MB", 500) * 1024 * 1024;
}

export function trainingUploadMaxBytes() {
  return Math.max(trainingImageMaxBytes(), trainingVideoMaxBytes());
}

function trainingMediaUrlSeconds() {
  const value = Number(process.env.TRAINING_MEDIA_URL_SECONDS ?? 15 * 60);
  return Number.isFinite(value) && value >= 60
    ? Math.min(30 * 60, Math.floor(value))
    : 15 * 60;
}

function configuredMegabytes(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 && value <= 2_048
    ? Math.floor(value)
    : fallback;
}

function parseByteRange(value: string | undefined, size?: number) {
  if (!value) return undefined;
  if (!size || !/^bytes=\d*-\d*$/.test(value)) {
    throw new HttpException("无效的媒体分段请求", 416);
  }
  const [startValue, endValue] = value.slice(6).split("-");
  let start: number;
  let end: number;
  if (!startValue) {
    const suffix = Number(endValue);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      throw new HttpException("无效的媒体分段请求", 416);
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    throw new HttpException("媒体分段超出文件范围", 416);
  }
  return { start, end: Math.min(end, size - 1), size };
}

function jsonContainsExactValue(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsExactValue(item, expected));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) =>
      jsonContainsExactValue(item, expected),
    );
  }
  return false;
}
