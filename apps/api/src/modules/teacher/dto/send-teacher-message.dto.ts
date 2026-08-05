import { MessageKind } from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class SendTeacherMessageDto {
  @IsOptional()
  @IsEnum(MessageKind)
  kind?: MessageKind;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];
}
