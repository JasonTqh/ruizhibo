import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { DailyReportService } from "./daily-report.service";
import {
  AdminDailyReportQueryDto,
  DailyReportDateQueryDto,
  TeacherDailyReportQueryDto,
  UpdateDailyReportNoteDto,
} from "./dto/daily-report.dto";

@Controller("parent")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.parent)
export class ParentDailyReportController {
  constructor(private readonly reports: DailyReportService) {}

  @Get("students/:studentId/daily-report")
  report(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Query() query: DailyReportDateQueryDto,
  ) {
    return this.reports.parentReport(user.id, studentId, query);
  }
}

@Controller("teacher")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class TeacherDailyReportController {
  constructor(private readonly reports: DailyReportService) {}

  @Get("daily-reports")
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: TeacherDailyReportQueryDto,
  ) {
    return this.reports.teacherReports(user.id, query);
  }

  @Get("students/:studentId/daily-report")
  report(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Query() query: DailyReportDateQueryDto,
  ) {
    return this.reports.teacherReport(user.id, studentId, query);
  }

  @Put("students/:studentId/daily-report-note")
  saveNote(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: UpdateDailyReportNoteDto,
  ) {
    return this.reports.saveTeacherNote(user.id, studentId, dto);
  }
}

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminDailyReportController {
  constructor(private readonly reports: DailyReportService) {}

  @Get("business/daily-reports")
  list(@Query() query: AdminDailyReportQueryDto) {
    return this.reports.adminReports(query);
  }

  @Get("business/daily-reports/:studentId")
  report(
    @Param("studentId") studentId: string,
    @Query() query: DailyReportDateQueryDto,
  ) {
    return this.reports.adminReport(studentId, query);
  }
}
