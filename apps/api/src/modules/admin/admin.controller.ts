import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminService } from "./admin.service";
import { BindGuardianDto } from "./dto/bind-guardian.dto";
import { BusinessQueryDto } from "./dto/business-query.dto";
import { CreateClassDto } from "./dto/create-class.dto";
import { CreateStudentDto } from "./dto/create-student.dto";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateWorkflowTemplateDto } from "./dto/create-workflow-template.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { UpdateWorkflowTemplateDto } from "./dto/update-workflow-template.dto";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";
import {
  UpdateLessonPlanStatusDto,
  UpdateResearchActivityStatusDto,
} from "./dto/update-business-status.dto";

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("teachers")
  listTeachers() {
    return this.adminService.listTeachers();
  }

  @Post("teachers")
  createTeacher(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherDto) {
    return this.adminService.createTeacher(user.id, dto);
  }

  @Patch("teachers/:id")
  updateTeacher(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.adminService.updateTeacher(user.id, id, dto);
  }

  @Delete("teachers/:id")
  deleteTeacher(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.deleteTeacher(user.id, id);
  }

  @Get("parents")
  listParents() {
    return this.adminService.listParents();
  }

  @Post("parents")
  createParent(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherDto) {
    return this.adminService.createParent(user.id, dto);
  }

  @Patch("parents/:id")
  updateParent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.adminService.updateParent(user.id, id, dto);
  }

  @Get("parents/:id/references")
  parentReferences(@Param("id") id: string) {
    return this.adminService.parentReferences(id);
  }

  @Delete("parents/:id")
  deleteParent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("force") force?: string,
  ) {
    return this.adminService.deleteParent(user.id, id, force === "true");
  }

  @Get("classes")
  listClasses() {
    return this.adminService.listClasses();
  }

  @Post("classes")
  createClass(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.adminService.createClass(user.id, dto);
  }

  @Patch("classes/:id")
  updateClass(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.adminService.updateClass(user.id, id, dto);
  }

  @Get("classes/:id/references")
  classReferences(@Param("id") id: string) {
    return this.adminService.classReferences(id);
  }

  @Delete("classes/:id")
  deleteClass(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("force") force?: string,
  ) {
    return this.adminService.deleteClass(user.id, id, force === "true");
  }

  @Get("students")
  listStudents() {
    return this.adminService.listStudents();
  }

  @Post("students")
  createStudent(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.adminService.createStudent(user.id, dto);
  }

  @Patch("students/:id")
  updateStudent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.adminService.updateStudent(user.id, id, dto);
  }

  @Get("students/:id/references")
  studentReferences(@Param("id") id: string) {
    return this.adminService.studentReferences(id);
  }

  @Delete("students/:id")
  deleteStudent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("force") force?: string,
  ) {
    return this.adminService.deleteStudent(user.id, id, force === "true");
  }

  @Post("students/:studentId/guardians")
  bindGuardian(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: BindGuardianDto,
  ) {
    return this.adminService.bindGuardian(user.id, studentId, dto);
  }

  @Delete("students/:studentId/guardians/:guardianId")
  unbindGuardian(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Param("guardianId") guardianId: string,
  ) {
    return this.adminService.unbindGuardian(user.id, studentId, guardianId);
  }

  @Patch("students/:studentId/guardians/:guardianId")
  updateGuardian(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Param("guardianId") guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.adminService.updateGuardian(
      user.id,
      studentId,
      guardianId,
      dto,
    );
  }

  @Get("workflow-templates")
  listWorkflowTemplates() {
    return this.adminService.listWorkflowTemplates();
  }

  @Post("workflow-templates")
  createWorkflowTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkflowTemplateDto,
  ) {
    return this.adminService.createWorkflowTemplate(user.id, dto);
  }

  @Patch("workflow-templates/:id")
  updateWorkflowTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowTemplateDto,
  ) {
    return this.adminService.updateWorkflowTemplate(user.id, id, dto);
  }

  @Get("workflow-templates/:id/references")
  workflowTemplateReferences(@Param("id") id: string) {
    return this.adminService.workflowTemplateReferences(id);
  }

  @Delete("workflow-templates/:id")
  deleteWorkflowTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("force") force?: string,
  ) {
    return this.adminService.deleteWorkflowTemplate(
      user.id,
      id,
      force === "true",
    );
  }

  @Get("business/homework")
  listHomework(@Query() query: BusinessQueryDto) {
    return this.adminService.listHomework(query);
  }

  @Get("business/teaching-records")
  listTeachingRecords(@Query() query: BusinessQueryDto) {
    return this.adminService.listTeachingRecords(query);
  }

  @Get("business/growth-records")
  listGrowthRecords(@Query() query: BusinessQueryDto) {
    return this.adminService.listGrowthRecords(query);
  }

  @Get("business/attendance")
  listAttendance(@Query() query: BusinessQueryDto) {
    return this.adminService.listAttendance(query);
  }

  @Get("business/workflows")
  listWorkflowSessions(@Query() query: BusinessQueryDto) {
    return this.adminService.listWorkflowSessions(query);
  }

  @Get("business/lesson-plans")
  listLessonPlans(@Query() query: BusinessQueryDto) {
    return this.adminService.listLessonPlans(query);
  }

  @Patch("business/lesson-plans/:id/status")
  updateLessonPlanStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateLessonPlanStatusDto,
  ) {
    return this.adminService.updateLessonPlanStatus(user.id, id, dto.status);
  }

  @Get("business/research-activities")
  listResearchActivities(@Query() query: BusinessQueryDto) {
    return this.adminService.listResearchActivities(query);
  }

  @Patch("business/research-activities/:id/status")
  updateResearchActivityStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateResearchActivityStatusDto,
  ) {
    return this.adminService.updateResearchActivityStatus(
      user.id,
      id,
      dto.status,
    );
  }

  @Get("audit-logs")
  auditLogs() {
    return this.adminService.auditLogs();
  }
}
