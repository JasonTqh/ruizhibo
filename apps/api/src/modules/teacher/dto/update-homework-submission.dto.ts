import { HomeworkStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateHomeworkSubmissionDto {
  @IsEnum(HomeworkStatus)
  status!: HomeworkStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
