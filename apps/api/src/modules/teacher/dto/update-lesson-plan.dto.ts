import { LessonPlanStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class UpdateLessonPlanDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  theme?: string;

  @IsOptional()
  @IsDateString()
  lessonDate?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  objectives?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsEnum(LessonPlanStatus)
  status?: LessonPlanStatus;
}
