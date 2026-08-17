import { Transform, Type } from "class-transformer";
import { PickupEventType, PickupHandoffStatus } from "@prisma/client";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ParentPickupHistoryQueryDto {
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
  pageSize = 30;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AdminPickupQueryDto extends ParentPickupHistoryQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

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
  @IsEnum(PickupEventType)
  type?: PickupEventType;

  @IsOptional()
  @IsEnum(PickupHandoffStatus)
  status?: PickupHandoffStatus;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  isException?: boolean;

  @IsOptional()
  @IsIn(["missing_arrival_today", "missing_leave_today", "exception"])
  quickFilter?: "missing_arrival_today" | "missing_leave_today" | "exception";
}
