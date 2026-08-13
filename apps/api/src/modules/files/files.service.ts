import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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

  private safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "general";
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
