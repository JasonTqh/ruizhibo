import { UserStatus } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateTeacherDto {
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

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsEnum(UserStatus)
  status: UserStatus = UserStatus.active;

  @IsOptional()
  @IsBoolean()
  assignTraining: boolean = true;

  @ValidateIf((dto: CreateTeacherDto) => dto.assignTraining !== false)
  @IsString()
  @MinLength(1)
  campusId?: string;

  @ValidateIf((dto: CreateTeacherDto) => dto.assignTraining !== false)
  @IsString()
  @MinLength(1)
  mentorId?: string;
}
