import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class DailyReportDateQueryDto {
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, {
    message: "date must use YYYY-MM-DD format",
  })
  date?: string;
}

export class TeacherDailyReportQueryDto extends DailyReportDateQueryDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(["absence", "left", "in_care", "picked_up", "waiting_pickup"])
  status?: "absence" | "left" | "in_care" | "picked_up" | "waiting_pickup";

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  needsAttention?: boolean;
}

export class AdminDailyReportQueryDto extends TeacherDailyReportQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hasException?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  published?: boolean;

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
  pageSize = 20;
}

export class UpdateDailyReportNoteDto extends DailyReportDateQueryDto {
  @IsString()
  @MaxLength(500)
  comment!: string;

  @IsBoolean()
  publish!: boolean;
}
