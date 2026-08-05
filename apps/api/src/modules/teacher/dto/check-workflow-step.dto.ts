import { IsArray, IsOptional, IsString } from "class-validator";

export class CheckWorkflowStepDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}
