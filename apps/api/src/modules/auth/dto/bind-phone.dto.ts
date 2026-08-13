import { UserRole } from "@prisma/client";
import { IsEnum, IsString, MinLength } from "class-validator";

export class BindPhoneDto {
  @IsString()
  @MinLength(1)
  bindingToken!: string;

  @IsString()
  @MinLength(1)
  phoneCode!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
