import { StudentStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateStudentDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsDateString()
  birthday?: string | null;

  @IsEnum(StudentStatus)
  status: StudentStatus = StudentStatus.active;
}
