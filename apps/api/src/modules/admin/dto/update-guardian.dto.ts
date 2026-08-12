import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class UpdateGuardianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  relation?: string;

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
  @IsIn(["active", "pending", "unlinked"])
  status?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
