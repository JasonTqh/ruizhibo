import {
  Body,
  Controller,
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
import {
  CreateAuthorizedPickupPersonDto,
  UpdateAuthorizedPickupPersonDto,
} from "./dto/authorized-pickup-person.dto";
import { BatchPickupDto } from "./dto/batch-pickup.dto";
import { LeaveStudentDto } from "./dto/leave-student.dto";
import { ArriveStudentDto, PickupEventDto } from "./dto/pickup-event.dto";
import {
  AdminPickupQueryDto,
  ParentPickupHistoryQueryDto,
} from "./dto/pickup-query.dto";
import { PickupService } from "./pickup.service";

@Controller("teacher/pickup")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class TeacherPickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Get("today")
  today(@CurrentUser() user: AuthUser, @Query("classId") classId?: string) {
    return this.pickupService.teacherToday(user.id, classId);
  }

  @Post("batch/picked-up")
  batchPickedUp(@CurrentUser() user: AuthUser, @Body() dto: BatchPickupDto) {
    return this.pickupService.batchPickedUpFromSchool(user.id, dto);
  }

  @Post("batch/arrived")
  batchArrived(@CurrentUser() user: AuthUser, @Body() dto: BatchPickupDto) {
    return this.pickupService.batchArrivedAtCenter(user.id, dto);
  }

  @Post("students/:studentId/picked-up")
  pickedUp(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: PickupEventDto,
  ) {
    return this.pickupService.pickedUpFromSchool(user.id, studentId, dto);
  }

  @Post("students/:studentId/arrived")
  arrived(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: ArriveStudentDto,
  ) {
    return this.pickupService.arrivedAtCenter(user.id, studentId, dto);
  }

  @Post("students/:studentId/left")
  left(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: LeaveStudentDto,
  ) {
    return this.pickupService.leftCenter(user.id, studentId, dto);
  }
}

@Controller("parent")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.parent)
export class ParentPickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Get("children/:studentId/pickup/today")
  today(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.pickupService.parentToday(user.id, studentId);
  }

  @Get("children/:studentId/pickup-records")
  history(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Query() query: ParentPickupHistoryQueryDto,
  ) {
    return this.pickupService.parentHistory(user.id, studentId, query);
  }
}

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminPickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Get("students/:studentId/pickup-persons")
  pickupPeople(@Param("studentId") studentId: string) {
    return this.pickupService.listAuthorizedPeople(studentId);
  }

  @Post("students/:studentId/pickup-persons")
  createPickupPerson(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateAuthorizedPickupPersonDto,
  ) {
    return this.pickupService.createAuthorizedPerson(user.id, studentId, dto);
  }

  @Patch("pickup-persons/:personId")
  updatePickupPerson(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
    @Body() dto: UpdateAuthorizedPickupPersonDto,
  ) {
    return this.pickupService.updateAuthorizedPerson(user.id, personId, dto);
  }

  @Get("business/pickup-records")
  pickupRecords(@Query() query: AdminPickupQueryDto) {
    return this.pickupService.adminRecords(query);
  }
}
