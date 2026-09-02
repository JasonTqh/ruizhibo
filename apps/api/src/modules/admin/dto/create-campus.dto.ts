import { Transform } from "class-transformer";
import { IsOptional, IsString, MinLength } from "class-validator";

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateCampusDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1, { message: "校区名称不能为空" })
  name!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  phone?: string | null;
}
