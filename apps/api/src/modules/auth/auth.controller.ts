import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { DevLoginDto } from "./dto/dev-login.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { AuthUser } from "./auth.types";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/dev-login")
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto);
  }

  @Post("auth/admin-login")
  adminLogin(@Body() dto: AdminLoginDto, @Req() request: Request) {
    return this.authService.adminLogin(dto, request.ip ?? "unknown");
  }

  @Post("auth/wechat-login")
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto);
  }

  @Post("auth/bind-phone")
  bindPhone(@Body() dto: BindPhoneDto) {
    return this.authService.bindPhone(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return {
      data: user,
    };
  }
}
