import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CheckWorkflowStepDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  studentIds?: string[];
}
