import { UserRole } from "@prisma/client";
import { IsEnum, IsString } from "class-validator";

export class DevLoginDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  phone!: string;
}
