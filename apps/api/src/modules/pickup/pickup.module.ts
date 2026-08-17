import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import {
  AdminPickupController,
  ParentPickupController,
  TeacherPickupController,
} from "./pickup.controller";
import { PickupService } from "./pickup.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    TeacherPickupController,
    ParentPickupController,
    AdminPickupController,
  ],
  providers: [PickupService],
  exports: [PickupService],
})
export class PickupModule {}
