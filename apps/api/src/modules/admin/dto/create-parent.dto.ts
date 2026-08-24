import { UserStatus } from "@prisma/client";
import { IsEnum, IsString, Matches, MinLength } from "class-validator";

export class CreateParentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsEnum(UserStatus)
  status: UserStatus = UserStatus.active;
}
