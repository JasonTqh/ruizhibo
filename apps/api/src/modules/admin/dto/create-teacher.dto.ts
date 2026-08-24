import { UserStatus } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateTeacherDto {
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
