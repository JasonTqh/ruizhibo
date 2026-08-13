import { UserRole } from "@prisma/client";
import { IsEnum, IsString, MinLength } from "class-validator";

export class WechatLoginDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
