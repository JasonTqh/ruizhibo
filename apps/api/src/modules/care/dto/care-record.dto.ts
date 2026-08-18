import { CareExceptionCategory, CareMealSlot } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export const MEAL_VALUES = ["good", "normal", "little", "refused"] as const;
export const REST_VALUES = ["slept", "rested", "no_rest"] as const;
export const MOOD_VALUES = ["good", "normal", "low", "upset"] as const;

abstract class CareRecordInputDto {
  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  photoUrls?: string[];
}

export class CreateMealCareRecordDto extends CareRecordInputDto {
  @IsEnum(CareMealSlot)
  slot!: CareMealSlot;

  @IsIn(MEAL_VALUES)
  value!: (typeof MEAL_VALUES)[number];
}

export class CreateWaterCareRecordDto extends CareRecordInputDto {}

export class CreateRestCareRecordDto extends CareRecordInputDto {
  @IsIn(REST_VALUES)
  value!: (typeof REST_VALUES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes?: number;
}

export class CreateMoodCareRecordDto extends CareRecordInputDto {
  @IsIn(MOOD_VALUES)
  value!: (typeof MOOD_VALUES)[number];
}

export class CreateExceptionCareRecordDto {
  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsEnum(CareExceptionCategory)
  category?: CareExceptionCategory;

  @IsBoolean()
  needsAttention!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  remark!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  photoUrls?: string[];
}
