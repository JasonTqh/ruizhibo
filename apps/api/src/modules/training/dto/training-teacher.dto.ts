import { Type } from "class-transformer";
import { TrainingStudyKind } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class StartStudySessionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  clientSessionId!: string;

  @IsString()
  @MinLength(1)
  chapterKey!: string;

  @IsEnum(TrainingStudyKind)
  kind!: TrainingStudyKind;
}

export class StudyHeartbeatDto {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  clientSessionId!: string;

  @IsBoolean()
  visible!: boolean;

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsBoolean()
  ended?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  videoPositionSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  videoDurationSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  watchedFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  watchedTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0.75, 1, 1.25, 1.5, 2])
  playbackRate?: number;
}

export class CompleteChapterDto {
  @IsString()
  @MinLength(1)
  chapterKey!: string;
}

export class QuizAnswerDto {
  @IsString()
  questionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  answerIds!: string[];
}

export class SubmitQuizDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

export class SubmitTrainingFeedbackDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  reflection?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  suggestion?: string;
}
