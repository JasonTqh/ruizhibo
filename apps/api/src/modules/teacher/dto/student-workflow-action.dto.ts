import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CompleteStudentWorkflowStepDto {
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

export class ResolveStudentWorkflowStepDto extends CompleteStudentWorkflowStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  declare remark: string;
}
