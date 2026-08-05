import { StudentStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsDateString()
  birthday?: string | null;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
