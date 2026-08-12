import {
  ResearchActivityStatus,
  ResearchActivityType,
} from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class UpdateResearchActivityDto {
  @IsOptional()
  @IsEnum(ResearchActivityType)
  type?: ResearchActivityType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  location?: string;

  @IsOptional()
  @IsEnum(ResearchActivityStatus)
  status?: ResearchActivityStatus;
}
