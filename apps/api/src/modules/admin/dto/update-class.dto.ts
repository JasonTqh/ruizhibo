import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  teacherId?: string | null;
}
