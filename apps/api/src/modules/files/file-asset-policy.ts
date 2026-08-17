import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface OwnedFileAssetOptions {
  ownerId: string;
  scene: string;
  urls: string[];
  imageOnly?: boolean;
  invalidMessage: string;
}

export async function assertOwnedFileAssetUrls(
  prisma: PrismaService,
  options: OwnedFileAssetOptions,
) {
  const urls = Array.from(new Set(options.urls));
  if (urls.length === 0) return urls;

  const ownedFiles = await prisma.fileAsset.findMany({
    where: {
      ownerId: options.ownerId,
      scene: options.scene,
      url: { in: urls },
      ...(options.imageOnly
        ? { mimeType: { startsWith: "image/" } }
        : undefined),
    },
    select: { url: true },
  });

  const ownedUrls = new Set(ownedFiles.map((file) => file.url));
  if (urls.some((url) => !ownedUrls.has(url))) {
    throw new BadRequestException(options.invalidMessage);
  }

  return urls;
}
