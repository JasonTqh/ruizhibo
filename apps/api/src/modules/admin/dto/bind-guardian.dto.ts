import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

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

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveNotice?: boolean;

  @IsOptional()
  @IsBoolean()
  canSubmitHomework?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewGrowth?: boolean;

  @IsOptional()
  @IsBoolean()
  canPickup?: boolean;

  @IsOptional()
  @IsIn(["active", "pending", "unlinked"])
  status?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
