import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth.types";
import { SupervisionService } from "./supervision.service";
import { SupervisionQueryDto } from "./dto/supervision-query.dto";

@Controller("teacher/supervision")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.teacher)
export class SupervisionController {
  constructor(private readonly service: SupervisionService) {}
  @Get("context") context(@CurrentUser() user: AuthUser) {
    return this.service.context(user.id);
  }
  @Get("lesson-plans") lessons(
    @CurrentUser() user: AuthUser,
    @Query() query: SupervisionQueryDto,
  ) {
    return this.service.lessonPlans(user.id, query);
  }
  @Get("teaching-records") records(
    @CurrentUser() user: AuthUser,
    @Query() query: SupervisionQueryDto,
  ) {
    return this.service.teachingRecords(user.id, query);
  }
  @Get("lesson-plans/:id") lesson(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.detail(user.id, "lesson", id);
  }
  @Get("teaching-records/:id") record(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.detail(user.id, "record", id);
  }
}
