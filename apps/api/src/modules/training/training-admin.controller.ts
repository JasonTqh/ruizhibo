import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  AssignTrainingDto,
  ChangeTrainingDueDateDto,
  CourseActionDto,
  ReasonDto,
  SetTrainingFeatureFlagDto,
  SetTrainingPermissionDto,
  SubmitPracticalDto,
  ConfirmSafetyDto,
  ExportTrainingQueryDto,
  TrainingListQueryDto,
  UpsertTrainingCourseDto,
} from "./dto/training-admin.dto";
import { TrainingAdminService } from "./training-admin.service";
import { TrainingAssignmentService } from "./training-assignment.service";
import { TrainingCourseService } from "./training-course.service";
import { TrainingExportService } from "./training-export.service";
import { TrainingPracticalService } from "./training-practical.service";
import { TrainingSafetyService } from "./training-safety.service";

@Controller("admin/training")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class TrainingAdminController {
  constructor(
    private readonly admin: TrainingAdminService,
    private readonly assignments: TrainingAssignmentService,
    private readonly courses: TrainingCourseService,
    private readonly exports: TrainingExportService,
    private readonly practical: TrainingPracticalService,
    private readonly safety: TrainingSafetyService,
  ) {}

  @Get("capabilities")
  capabilities(@CurrentUser() user: AuthUser) {
    return this.admin.capabilities(user.id);
  }

  @Get("assignment-subjects")
  assignmentSubjects(@CurrentUser() user: AuthUser) {
    return this.admin.assignmentSubjects(user.id);
  }

  @Get("courses")
  listCourses(@CurrentUser() user: AuthUser) {
    return this.courses.listAdmin(user.id);
  }

  @Post("courses")
  createCourse(@CurrentUser() user: AuthUser, @Body() dto: UpsertTrainingCourseDto) {
    return this.courses.create(user.id, dto);
  }

  @Get("courses/:id")
  course(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.courses.getAdmin(user.id, id);
  }

  @Patch("courses/:id")
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertTrainingCourseDto,
  ) {
    return this.courses.update(user.id, id, dto);
  }

  @Delete("courses/:id")
  removeCourse(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.courses.removeDraft(user.id, id, dto.reason);
  }

  @Get("assignments/stats")
  stats(@CurrentUser() user: AuthUser, @Query("campusId") campusId?: string) {
    return this.assignments.stats(user.id, campusId);
  }

  @Get("assignments")
  listAssignments(
    @CurrentUser() user: AuthUser,
    @Query() query: TrainingListQueryDto,
  ) {
    return this.assignments.list(user.id, query);
  }

  @Get("assignments-export.xlsx")
  async exportAssignments(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportTrainingQueryDto,
    @Res() response: Response,
  ) {
    const file = await this.exports.assignments(user.id, query);
    return sendWorkbook(response, file);
  }

  @Post("assignments")
  assign(@CurrentUser() user: AuthUser, @Body() dto: AssignTrainingDto) {
    return this.assignments.assign(user.id, dto);
  }

  @Get("assignments/:id")
  assignment(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assignments.detail(user.id, id);
  }

  @Patch("assignments/:id/due-date")
  changeDue(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ChangeTrainingDueDateDto,
  ) {
    return this.assignments.changeDueDate(user.id, id, dto.dueAt, dto.reason);
  }

  @Post("assignments/:id/terminate")
  terminate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.assignments.terminate(user.id, id, dto.reason);
  }

  @Post("courses/exempt")
  exempt(@CurrentUser() user: AuthUser, @Body() dto: CourseActionDto) {
    return this.assignments.exemptCourse(
      user.id,
      dto.assignmentCourseId,
      dto.reason,
    );
  }

  @Post("courses/relearn")
  relearn(@CurrentUser() user: AuthUser, @Body() dto: CourseActionDto) {
    return this.assignments.relearnCourse(
      user.id,
      dto.assignmentCourseId,
      dto.reason,
    );
  }

  @Get("practical/pending")
  pendingPractical(@CurrentUser() user: AuthUser) {
    return this.practical.pending(user.id);
  }

  @Post("practical/:assignmentCourseId")
  submitPractical(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
    @Body() dto: SubmitPracticalDto,
  ) {
    return this.practical.submit(user.id, assignmentCourseId, dto);
  }

  @Get("safety/pending")
  pendingSafety(@CurrentUser() user: AuthUser) {
    return this.safety.pending(user.id);
  }

  @Post("safety/:assignmentId/confirm")
  confirmSafety(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() dto: ConfirmSafetyDto,
  ) {
    return this.safety.confirm(user.id, assignmentId, dto);
  }

  @Post("safety/:assignmentId/revoke")
  revokeSafety(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.safety.revoke(user.id, assignmentId, dto.reason);
  }

  @Get("permissions")
  permissions(@CurrentUser() user: AuthUser) {
    return this.admin.listPermissions(user.id);
  }

  @Get("permission-subjects")
  permissionSubjects(@CurrentUser() user: AuthUser) {
    return this.admin.listPermissionSubjects(user.id);
  }

  @Patch("permissions")
  setPermission(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetTrainingPermissionDto,
  ) {
    return this.admin.setPermission(user.id, dto);
  }

  @Get("feature-flags")
  flags(@CurrentUser() user: AuthUser) {
    return this.admin.listFlags(user.id);
  }

  @Patch("feature-flags/:campusId")
  setFlag(
    @CurrentUser() user: AuthUser,
    @Param("campusId") campusId: string,
    @Body() dto: SetTrainingFeatureFlagDto,
  ) {
    return this.admin.setFlag(user.id, campusId, dto);
  }

  @Get("feedback")
  feedback(@CurrentUser() user: AuthUser, @Query() query: TrainingListQueryDto) {
    return this.admin.feedback(user.id, query);
  }

  @Get("feedback-export.xlsx")
  async exportFeedback(
    @CurrentUser() user: AuthUser,
    @Query() query: TrainingListQueryDto,
    @Res() response: Response,
  ) {
    const file = await this.exports.feedback(user.id, query);
    return sendWorkbook(response, file);
  }

  @Get("audit")
  audits(@CurrentUser() user: AuthUser, @Query("campusId") campusId?: string) {
    return this.admin.audits(user.id, campusId);
  }
}

function sendWorkbook(
  response: Response,
  file: { buffer: Buffer; fileName: string },
) {
  response.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  response.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  response.setHeader("Cache-Control", "private, no-store");
  return response.send(file.buffer);
}
