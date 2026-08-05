import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminService } from "./admin.service";
import { BindGuardianDto } from "./dto/bind-guardian.dto";
import { CreateClassDto } from "./dto/create-class.dto";
import { CreateStudentDto } from "./dto/create-student.dto";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateWorkflowTemplateDto } from "./dto/create-workflow-template.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { UpdateWorkflowTemplateDto } from "./dto/update-workflow-template.dto";

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

  @Get("audit-logs")
  auditLogs() {
    return this.adminService.auditLogs();
  }
}
