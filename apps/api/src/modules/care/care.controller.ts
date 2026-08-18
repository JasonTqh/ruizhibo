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
import { CareService } from "./care.service";
import { AdminCareQueryDto } from "./dto/admin-care-query.dto";
import {
  BatchMealCareDto,
  BatchRestCareDto,
  BatchWaterCareDto,
} from "./dto/batch-care.dto";
import {
  CreateExceptionCareRecordDto,
  CreateMealCareRecordDto,
  CreateMoodCareRecordDto,
  CreateRestCareRecordDto,
  CreateWaterCareRecordDto,
} from "./dto/care-record.dto";

@Controller("teacher")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class TeacherCareController {
  constructor(private readonly care: CareService) {}

  @Get("care/today")
  today(@CurrentUser() user: AuthUser, @Query("classId") classId?: string) {
    return this.care.teacherToday(user.id, classId);
  }

  @Post("care/meal/batch")
  batchMeal(@CurrentUser() user: AuthUser, @Body() dto: BatchMealCareDto) {
    return this.care.batchMeal(user.id, dto);
  }

  @Post("care/water/batch")
  batchWater(@CurrentUser() user: AuthUser, @Body() dto: BatchWaterCareDto) {
    return this.care.batchWater(user.id, dto);
  }

  @Post("care/rest/batch")
  batchRest(@CurrentUser() user: AuthUser, @Body() dto: BatchRestCareDto) {
    return this.care.batchRest(user.id, dto);
  }

  @Post("students/:studentId/care-records/meal")
  meal(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateMealCareRecordDto,
  ) {
    return this.care.createMeal(user.id, studentId, dto);
  }

  @Post("students/:studentId/care-records/water")
  water(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateWaterCareRecordDto,
  ) {
    return this.care.createWater(user.id, studentId, dto);
  }

  @Post("students/:studentId/care-records/rest")
  rest(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateRestCareRecordDto,
  ) {
    return this.care.createRest(user.id, studentId, dto);
  }

  @Post("students/:studentId/care-records/mood")
  mood(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateMoodCareRecordDto,
  ) {
    return this.care.createMood(user.id, studentId, dto);
  }

  @Post("students/:studentId/care-records/exception")
  exception(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreateExceptionCareRecordDto,
  ) {
    return this.care.createException(user.id, studentId, dto);
  }
}

@Controller("parent")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.parent)
export class ParentCareController {
  constructor(private readonly care: CareService) {}

  @Get("children/:studentId/care/today")
  today(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.care.parentToday(user.id, studentId);
  }
}

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminCareController {
  constructor(private readonly care: CareService) {}

  @Get("business/care-records")
  records(@Query() query: AdminCareQueryDto) {
    return this.care.adminRecords(query);
  }
}
