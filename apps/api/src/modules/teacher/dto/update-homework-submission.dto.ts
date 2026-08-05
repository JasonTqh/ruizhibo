import { HomeworkStatus } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export class UpdateHomeworkSubmissionDto {
  @IsOptional()
  @IsEnum(HomeworkStatus)
  status?: HomeworkStatus;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];

  @IsOptional()
  @IsDateString()
  submittedAt?: string | null;

  @IsOptional()
  @IsDateString()
  reviewedAt?: string | null;

  @IsOptional()
  @IsString()
  remark?: string | null;
}
