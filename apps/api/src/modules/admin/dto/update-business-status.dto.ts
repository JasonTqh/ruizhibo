import { LessonPlanStatus, ResearchActivityStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateLessonPlanStatusDto {
  @IsEnum(LessonPlanStatus)
  status!: LessonPlanStatus;
}

export class UpdateResearchActivityStatusDto {
  @IsEnum(ResearchActivityStatus)
  status!: ResearchActivityStatus;
}
