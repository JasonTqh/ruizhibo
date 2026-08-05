import { UserStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class UpdateTeacherDto {
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
}
