import { IsOptional, IsString, Matches } from "class-validator";

export class BindPhoneDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  wechatOpenid?: string;
}
