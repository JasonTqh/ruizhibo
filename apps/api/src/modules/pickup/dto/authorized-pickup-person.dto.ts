import { PickupRelationship } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateAuthorizedPickupPersonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsEnum(PickupRelationship)
  relationship!: PickupRelationship;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-() ]{6,30}$/)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive = true;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}

export class UpdateAuthorizedPickupPersonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEnum(PickupRelationship)
  relationship?: PickupRelationship;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-() ]{6,30}$/)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}
