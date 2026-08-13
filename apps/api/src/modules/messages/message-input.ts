import { BadRequestException } from "@nestjs/common";
import { MessageKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface SendMessageInput {
  kind?: MessageKind;
  content?: string;
  fileUrls?: string[];
}

export async function prepareMessageInput(
  prisma: PrismaService,
  senderId: string,
  input: SendMessageInput,
) {
  const kind = input.kind ?? MessageKind.text;
  const content = input.content?.trim() ?? "";
  const fileUrls = Array.from(new Set(input.fileUrls ?? []));

  if (kind === MessageKind.text) {
    if (!content) {
      throw new BadRequestException("消息内容不能为空");
    }
    if (fileUrls.length > 0) {
      throw new BadRequestException("文字消息不能携带图片");
    }
    return { kind, content, fileUrls: [] };
  }

  if (kind !== MessageKind.image) {
    throw new BadRequestException("当前仅支持文字或图片消息");
  }
  if (fileUrls.length === 0) {
    throw new BadRequestException("图片消息至少需要一张图片");
  }
  if (fileUrls.length > 3) {
    throw new BadRequestException("每条消息最多发送 3 张图片");
  }

  const ownedFiles = await prisma.fileAsset.count({
    where: {
      ownerId: senderId,
      scene: "message",
      url: { in: fileUrls },
      mimeType: { startsWith: "image/" },
    },
  });
  if (ownedFiles !== fileUrls.length) {
    throw new BadRequestException("消息图片无效或不属于当前用户");
  }

  return {
    kind,
    content: content || "[图片]",
    fileUrls,
  };
}
