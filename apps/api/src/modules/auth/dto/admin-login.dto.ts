import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class AdminLoginDto {
  @Matches(/^1\d{10}$/, { message: "请输入 11 位管理员手机号" })
  phone!: string;

  @IsString()
  @MinLength(12, { message: "管理员密码至少需要 12 位" })
  @MaxLength(128, { message: "管理员密码不能超过 128 位" })
  password!: string;
}
