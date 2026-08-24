import { Transform, Type } from "class-transformer";
import {
  TrainingAssignmentStatus,
  TrainingContentStatus,
  TrainingCourseCategory,
  TrainingMediaType,
  TrainingPermission,
  TrainingPracticalConclusion,
  TrainingQuestionType,
  TrainingSafetyStatus,
} from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class TrainingMediaDto {
  @IsString()
  @MinLength(1)
  fileAssetId!: string;

  @IsEnum(TrainingMediaType)
  type!: TrainingMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  @IsInt()
  @Min(1)
  sortOrder!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;
}

export class TrainingChapterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(100_000)
  contentHtml!: string;

  @IsInt()
  @Min(1)
  sortOrder!: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TrainingMediaDto)
  media: TrainingMediaDto[] = [];
}

export class TrainingQuestionOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;
}

export class TrainingQuestionDto {
  @IsEnum(TrainingQuestionType)
  type!: TrainingQuestionType;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  prompt!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TrainingQuestionOptionDto)
  options!: TrainingQuestionOptionDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  correctAnswers!: string[];

  @IsInt()
  @Min(1)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  explanation?: string;

  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class TrainingQuizDto {
  @IsInt()
  @Min(0)
  @Max(100)
  passScore: number = 80;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrainingQuestionDto)
  questions!: TrainingQuestionDto[];
}

export class TrainingPracticalItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class UpsertTrainingCourseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1_000)
  reason!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(TrainingCourseCategory)
  category!: TrainingCourseCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  summary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  expectedMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  minimumMinutes!: number;

  @IsInt()
  @Min(1)
  sortOrder!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  requiresPractical!: boolean;

  @IsBoolean()
  isSafety!: boolean;

  @IsOptional()
  @IsString()
  coverAssetId?: string;

  @IsEnum(TrainingContentStatus)
  status!: TrainingContentStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrainingChapterDto)
  chapters!: TrainingChapterDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TrainingQuizDto)
  quiz?: TrainingQuizDto;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrainingPracticalItemDto)
  practicalItems: TrainingPracticalItemDto[] = [];
}

export class AssignTrainingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  teacherIds!: string[];

  @IsString()
  @MinLength(1)
  campusId!: string;

  @IsString()
  @MinLength(1)
  mentorId!: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1_000)
  reason!: string;
}

export class TrainingListQueryDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsEnum(TrainingAssignmentStatus)
  status?: TrainingAssignmentStatus;

  @IsOptional()
  @IsString()
  deadlineStatus?: string;

  @IsOptional()
  @IsString()
  mentorId?: string;

  @IsOptional()
  @IsEnum(TrainingSafetyStatus)
  safetyStatus?: TrainingSafetyStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 20;
}

export class ReasonDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1_000)
  reason!: string;
}

export class ChangeTrainingDueDateDto extends ReasonDto {
  @IsISO8601()
  dueAt!: string;
}

export class CourseActionDto extends ReasonDto {
  @IsString()
  @MinLength(1)
  assignmentCourseId!: string;
}

export class PracticalChecklistResultDto {
  @IsString()
  itemId!: string;

  @IsBoolean()
  passed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class SubmitPracticalDto {
  @IsEnum(TrainingPracticalConclusion)
  conclusion!: TrainingPracticalConclusion;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PracticalChecklistResultDto)
  checklist!: PracticalChecklistResultDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  comment!: string;
}

export class ConfirmSafetyDto {
  @IsBoolean()
  declarationAccepted!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  declaration!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}

export class SetTrainingFeatureFlagDto extends ReasonDto {
  @IsBoolean()
  enabled!: boolean;
}

export class SetTrainingPermissionDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsEnum(TrainingPermission)
  permission!: TrainingPermission;

  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @MinLength(2)
  @MaxLength(1_000)
  reason!: string;
}

export class ExportTrainingQueryDto extends TrainingListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === "true")
  includeHistory: boolean = false;
}

export class JsonObjectDto {
  @IsObject()
  value!: Record<string, unknown>;
}
