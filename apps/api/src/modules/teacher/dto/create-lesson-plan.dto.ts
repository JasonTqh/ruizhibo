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

export class CreateLessonPlanDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(1)
  theme!: string;

  @IsDateString()
  lessonDate!: string;

  @IsInt()
  @Min(10)
  @Max(480)
  durationMinutes!: number;

  @IsString()
  @MinLength(1)
  objectives!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEnum(LessonPlanStatus)
  status?: LessonPlanStatus;
}
