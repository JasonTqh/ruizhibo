import { Transform, Type } from "class-transformer";
import { StudentCareRecordType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class AdminCareQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(StudentCareRecordType)
  type?: StudentCareRecordType;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  needsAttention?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(["today_exception", "needs_attention"])
  quickFilter?: "today_exception" | "needs_attention";
}
