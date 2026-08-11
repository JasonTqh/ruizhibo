import { LessonPlanStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateLessonPlanStatusDto {
  @IsEnum(LessonPlanStatus)
  status!: LessonPlanStatus;
}
