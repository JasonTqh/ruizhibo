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

export class CreateResearchActivityDto {
  @IsString()
  campusId!: string;

  @IsEnum(ResearchActivityType)
  type!: ResearchActivityType;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @MinLength(1)
  location!: string;

  @IsOptional()
  @IsEnum(ResearchActivityStatus)
  status?: ResearchActivityStatus;
}
