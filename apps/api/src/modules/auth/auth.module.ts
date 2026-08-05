import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";
import { RolesGuard } from "./roles.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, JwtService, RolesGuard],
  exports: [AuthGuard, JwtService, RolesGuard],
})
export class AuthModule {}
