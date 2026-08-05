import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateTeachingRecordDto {
  @IsString()
  classId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  course!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
