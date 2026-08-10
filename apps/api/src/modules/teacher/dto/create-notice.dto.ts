import { NoticeKind } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateNoticeDto {
  @IsString()
  classId!: string;

  @IsEnum(NoticeKind)
  kind!: NoticeKind;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
