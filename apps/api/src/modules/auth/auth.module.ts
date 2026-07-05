import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, JwtService],
  exports: [AuthGuard, JwtService],
})
export class AuthModule {}
