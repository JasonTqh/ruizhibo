import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CheckWorkflowStepDto } from "./dto/check-workflow-step.dto";
import { CreateGrowthFeedbackDto } from "./dto/create-growth-feedback.dto";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { CreateTeachingRecordDto } from "./dto/create-teaching-record.dto";
import { SendTeacherMessageDto } from "./dto/send-teacher-message.dto";
import { UpdateHomeworkSubmissionDto } from "./dto/update-homework-submission.dto";
import { TeacherService } from "./teacher.service";

@Controller("teacher")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthUser) {
    return this.teacherService.dashboard(user.id);
  }

  @Get("classes")
  classes(@CurrentUser() user: AuthUser) {
    return this.teacherService.classes(user.id);
  }

  @Get("classes/:classId/students")
  classStudents(
    @CurrentUser() user: AuthUser,
    @Param("classId") classId: string,
  ) {
    return this.teacherService.classStudents(user.id, classId);
  }

  @Get("workflow/today")
  workflowToday(@CurrentUser() user: AuthUser) {
    return this.teacherService.workflowToday(user.id);
  }

  @Post("workflow/:sessionId/steps/:stepId/check")
  checkWorkflowStep(
    @CurrentUser() user: AuthUser,
    @Param("sessionId") sessionId: string,
    @Param("stepId") stepId: string,
    @Body() dto: CheckWorkflowStepDto,
  ) {
    return this.teacherService.checkWorkflowStep(
      user.id,
      sessionId,
      stepId,
      dto,
    );
  }

  @Get("teaching-records")
  teachingRecords(@CurrentUser() user: AuthUser) {
    return this.teacherService.teachingRecords(user.id);
  }

  @Post("teaching-records")
  createTeachingRecord(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeachingRecordDto,
  ) {
    return this.teacherService.createTeachingRecord(user.id, dto);
  }

  @Post("students/:studentId/growth-records")
  createGrowthFeedback(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateGrowthFeedbackDto,
  ) {
    return this.teacherService.createGrowthFeedback(user.id, studentId, dto);
  }

  @Get("homework")
  homework(@CurrentUser() user: AuthUser) {
    return this.teacherService.homework(user.id);
  }

  @Post("homework")
  createHomework(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHomeworkDto,
  ) {
    return this.teacherService.createHomework(user.id, dto);
  }

  @Patch("homework-submissions/:submissionId")
  updateHomeworkSubmission(
    @CurrentUser() user: AuthUser,
    @Param("submissionId") submissionId: string,
    @Body() dto: UpdateHomeworkSubmissionDto,
  ) {
    return this.teacherService.updateHomeworkSubmission(
      user.id,
      submissionId,
      dto,
    );
  }

  @Get("notices")
  notices(@CurrentUser() user: AuthUser) {
    return this.teacherService.notices(user.id);
  }

  @Post("notices")
  createNotice(@CurrentUser() user: AuthUser, @Body() dto: CreateNoticeDto) {
    return this.teacherService.createNotice(user.id, dto);
  }

  @Get("notices/:noticeId/receipts")
  noticeReceipts(
    @CurrentUser() user: AuthUser,
    @Param("noticeId") noticeId: string,
  ) {
    return this.teacherService.noticeReceipts(user.id, noticeId);
  }

  @Get("conversations")
  conversations(@CurrentUser() user: AuthUser) {
    return this.teacherService.conversations(user.id);
  }

  @Get("conversations/:conversationId/messages")
  conversationMessages(
    @CurrentUser() user: AuthUser,
    @Param("conversationId") conversationId: string,
  ) {
    return this.teacherService.conversationMessages(user.id, conversationId);
  }

  @Post("conversations/:conversationId/messages")
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: SendTeacherMessageDto,
  ) {
    return this.teacherService.sendMessage(user.id, conversationId, dto);
  }
}
