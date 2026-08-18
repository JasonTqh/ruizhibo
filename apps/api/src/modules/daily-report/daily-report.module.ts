import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import {
  AdminDailyReportController,
  ParentDailyReportController,
  TeacherDailyReportController,
} from "./daily-report.controller";
import { DailyReportService } from "./daily-report.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    ParentDailyReportController,
    TeacherDailyReportController,
    AdminDailyReportController,
  ],
  providers: [DailyReportService],
  exports: [DailyReportService],
})
export class DailyReportModule {}
