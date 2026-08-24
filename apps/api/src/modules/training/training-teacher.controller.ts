import {
  Body,
  Controller,
  Get,
  Param,
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
import { SubmitPracticalDto } from "./dto/training-admin.dto";
import {
  CompleteChapterDto,
  StartStudySessionDto,
  StudyHeartbeatDto,
  SubmitQuizDto,
  SubmitTrainingFeedbackDto,
} from "./dto/training-teacher.dto";
import { TrainingPracticalService } from "./training-practical.service";
import { TrainingTeacherService } from "./training-teacher.service";

@Controller("teacher/training")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class TrainingTeacherController {
  constructor(
    private readonly training: TrainingTeacherService,
    private readonly practical: TrainingPracticalService,
  ) {}

  @Get("home")
  home(@CurrentUser() user: AuthUser) {
    return this.training.home(user.id);
  }

  @Get("current")
  current(@CurrentUser() user: AuthUser) {
    return this.training.currentPlan(user.id);
  }

  @Get("library")
  library(@CurrentUser() user: AuthUser, @Query("q") search?: string) {
    return this.training.library(user.id, search?.trim() || undefined);
  }

  @Get("courses/:assignmentCourseId")
  course(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
  ) {
    return this.training.course(user.id, assignmentCourseId);
  }

  @Post("courses/:assignmentCourseId/study/start")
  startStudy(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
    @Body() dto: StartStudySessionDto,
  ) {
    return this.training.startStudy(user.id, assignmentCourseId, dto);
  }

  @Post("study/heartbeat")
  heartbeat(@CurrentUser() user: AuthUser, @Body() dto: StudyHeartbeatDto) {
    return this.training.heartbeat(user.id, dto);
  }

  @Post("courses/:assignmentCourseId/chapters/complete")
  completeChapter(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
    @Body() dto: CompleteChapterDto,
  ) {
    return this.training.completeChapter(
      user.id,
      assignmentCourseId,
      dto.chapterKey,
    );
  }

  @Post("courses/:assignmentCourseId/quiz")
  quiz(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.training.submitQuiz(user.id, assignmentCourseId, dto);
  }

  @Post("assignments/:assignmentId/feedback")
  feedback(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() dto: SubmitTrainingFeedbackDto,
  ) {
    return this.training.submitFeedback(user.id, assignmentId, dto);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: AuthUser) {
    return this.training.notifications(user.id);
  }

  @Post("notifications/:notificationId/read")
  readNotification(
    @CurrentUser() user: AuthUser,
    @Param("notificationId") notificationId: string,
  ) {
    return this.training.readNotification(user.id, notificationId);
  }

  @Get("practical/pending")
  practicalPending(@CurrentUser() user: AuthUser) {
    return this.practical.pending(user.id);
  }

  @Post("practical/:assignmentCourseId")
  practicalSubmit(
    @CurrentUser() user: AuthUser,
    @Param("assignmentCourseId") assignmentCourseId: string,
    @Body() dto: SubmitPracticalDto,
  ) {
    return this.practical.submit(user.id, assignmentCourseId, dto);
  }
}
