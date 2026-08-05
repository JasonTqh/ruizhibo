import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { UploadFileDto } from "./dto/upload-file.dto";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(ownerId: string, dto: UploadFileDto) {
    if (!allowedMimeTypes.has(dto.mimeType)) {
      throw new BadRequestException("Unsupported file type");
    }

    const buffer = Buffer.from(dto.base64, "base64");
    if (dto.size && dto.size !== buffer.length) {
      throw new BadRequestException("File size does not match payload");
    }
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException("File is too large");
    }

    const scene = this.safeSegment(dto.scene ?? "general");
    const extension = this.resolveExtension(dto.fileName, dto.mimeType);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    const uploadRoot = join(process.cwd(), "uploads");
    const dir = join(uploadRoot, scene);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), buffer);

    const url = `/uploads/${scene}/${fileName}`;
    const asset = await this.prisma.fileAsset.create({
      data: {
        url,
        mimeType: dto.mimeType,
        size: buffer.length,
        ownerId,
        scene,
      },
    });

    return { data: asset };
  }

  private safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "general";
  }

  private resolveExtension(fileName: string, mimeType: string) {
    const fromName = extname(fileName).toLowerCase();
    if (fromName && /^[.][a-z0-9]+$/.test(fromName)) {
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
}
