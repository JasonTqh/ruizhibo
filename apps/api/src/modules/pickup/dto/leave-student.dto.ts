import { PickupHandoffStatus, PickupRelationship } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class LeaveStudentDto {
  @IsOptional()
  @IsEnum(PickupHandoffStatus)
  status: PickupHandoffStatus = PickupHandoffStatus.normal;

  @IsOptional()
  @IsIn(["guardian", "authorized_person"])
  pickupPersonType?: "guardian" | "authorized_person";

  @IsOptional()
  @IsString()
  @MinLength(1)
  pickupPersonId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  temporaryName?: string;

  @IsOptional()
  @IsEnum(PickupRelationship)
  temporaryRelationship?: PickupRelationship;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-() ]{6,30}$/)
  temporaryPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  exceptionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}
