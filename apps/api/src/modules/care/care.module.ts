import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import {
  AdminCareController,
  ParentCareController,
  TeacherCareController,
} from "./care.controller";
import { CareService } from "./care.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [TeacherCareController, ParentCareController, AdminCareController],
  providers: [CareService],
  exports: [CareService],
})
export class CareModule {}
