import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateClassDto {
  @IsString()
  campusId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  teacherId?: string | null;
}
