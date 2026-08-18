import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SendParentMessageDto } from "./dto/send-parent-message.dto";
import { SubmitHomeworkDto } from "./dto/submit-homework.dto";
import { ParentService } from "./parent.service";

@Controller("parent")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.parent)
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  @Get("children")
  children(@CurrentUser() user: AuthUser) {
    return this.parentService.children(user.id);
  }

  @Get("children/:studentId/timeline")
  timeline(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.parentService.timeline(user.id, studentId);
  }

  @Get("children/:studentId/attendance")
  attendance(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.parentService.attendance(user.id, studentId);
  }

  @Get("children/:studentId/workflow/today")
  workflowToday(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.parentService.workflowToday(user.id, studentId);
  }

  @Get("children/:studentId/homework")
  homework(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.parentService.homework(user.id, studentId);
  }

  @Post("homework-submissions/:submissionId/submit")
  submitHomework(
    @CurrentUser() user: AuthUser,
    @Param("submissionId") submissionId: string,
    @Body() dto: SubmitHomeworkDto,
  ) {
    return this.parentService.submitHomework(user.id, submissionId, dto);
  }

  @Get("notices")
  notices(@CurrentUser() user: AuthUser) {
    return this.parentService.notices(user.id);
  }

  @Post("notice-receipts/:receiptId/view")
  viewNotice(
    @CurrentUser() user: AuthUser,
    @Param("receiptId") receiptId: string,
  ) {
    return this.parentService.viewNotice(user.id, receiptId);
  }

  @Post("notice-receipts/:receiptId/confirm")
  confirmNotice(
    @CurrentUser() user: AuthUser,
    @Param("receiptId") receiptId: string,
  ) {
    return this.parentService.confirmNotice(user.id, receiptId);
  }

  @Get("conversations")
  conversations(@CurrentUser() user: AuthUser) {
    return this.parentService.conversations(user.id);
  }

  @Get("conversations/:conversationId/messages")
  conversationMessages(
    @CurrentUser() user: AuthUser,
    @Param("conversationId") conversationId: string,
  ) {
    return this.parentService.conversationMessages(user.id, conversationId);
  }

  @Post("conversations/:conversationId/messages")
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: SendParentMessageDto,
  ) {
    return this.parentService.sendMessage(user.id, conversationId, dto);
  }
}
