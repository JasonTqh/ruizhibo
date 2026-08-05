import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateGrowthFeedbackDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsBoolean()
  visibleToParent?: boolean;

  @IsOptional()
  @IsDateString()
  happenedAt?: string;
}
