import { CareMealSlot } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
import { MEAL_VALUES, REST_VALUES } from "./care-record.dto";

abstract class BatchCareDto {
  @IsString()
  @MinLength(1)
  classId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  studentIds!: string[];

  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class BatchMealCareDto extends BatchCareDto {
  @IsEnum(CareMealSlot)
  slot!: CareMealSlot;

  @IsIn(MEAL_VALUES)
  value!: (typeof MEAL_VALUES)[number];
}

export class BatchRestCareDto extends BatchCareDto {
  @IsIn(REST_VALUES)
  value!: (typeof REST_VALUES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes?: number;
}

export class BatchWaterCareDto extends BatchCareDto {}
