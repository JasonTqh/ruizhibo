import { IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class CreateHomeworkDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
