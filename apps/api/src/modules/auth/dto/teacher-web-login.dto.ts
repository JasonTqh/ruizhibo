import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class TeacherWebLoginDto {
  @Matches(/^1\d{10}$/, { message: "请输入 11 位教师手机号" })
  phone!: string;

  @IsString()
  @MinLength(12, { message: "教师学院密码至少需要 12 位" })
  @MaxLength(128, { message: "教师学院密码不能超过 128 位" })
  password!: string;
}
