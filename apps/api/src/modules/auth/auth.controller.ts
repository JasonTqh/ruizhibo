import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { DevLoginDto } from "./dto/dev-login.dto";
import { AuthUser } from "./auth.types";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/dev-login")
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return {
      data: user,
    };
  }
}
