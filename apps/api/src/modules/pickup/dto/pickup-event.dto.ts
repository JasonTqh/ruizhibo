import { PickupArrivalMethod } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class PickupEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}

export class ArriveStudentDto extends PickupEventDto {
  @IsEnum(PickupArrivalMethod)
  arrivalMethod!: PickupArrivalMethod;

  @IsOptional()
  @IsIn(["guardian", "authorized_person"])
  deliveryPersonType?: "guardian" | "authorized_person";

  @IsOptional()
  @IsString()
  @MinLength(1)
  deliveryPersonId?: string;
}
