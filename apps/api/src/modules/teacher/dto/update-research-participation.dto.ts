import { ResearchParticipationStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateResearchParticipationDto {
  @IsEnum(ResearchParticipationStatus)
  status!: ResearchParticipationStatus;
}
