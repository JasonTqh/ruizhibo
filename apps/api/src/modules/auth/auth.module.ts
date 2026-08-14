import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AdminLoginThrottleService } from "./admin-login-throttle.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    JwtService,
    RolesGuard,
    AdminLoginThrottleService,
  ],
  exports: [AuthGuard, JwtService, RolesGuard],
})
export class AuthModule {}
