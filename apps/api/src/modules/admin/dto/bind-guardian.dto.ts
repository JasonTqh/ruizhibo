import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class BindGuardianDto {
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  parentName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/)
  parentPhone?: string;

  @IsString()
  @MinLength(1)
  relation!: string;
}
