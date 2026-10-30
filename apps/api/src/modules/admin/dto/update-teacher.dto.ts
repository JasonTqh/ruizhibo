import { TeacherEmploymentStatus, UserStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class UpdateTeacherDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  managedCampusIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(["teacher", "supervisor"], { each: true })
  teacherPositions?: string[];

  @IsOptional()
  @IsIn(["teacher", "supervisor", "supervisor_teacher"])
  teacherPosition?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(TeacherEmploymentStatus)
  employmentStatus?: TeacherEmploymentStatus;
}
