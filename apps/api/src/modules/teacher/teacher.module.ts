import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { TeacherController } from "./teacher.controller";
import { TeacherService } from "./teacher.service";

import { SupervisionService } from "./supervision.service";
import { SupervisionController } from "./supervision.controller";

@Module({
  imports: [AuditModule, AuthModule, PrismaModule, WorkflowModule],
  controllers: [TeacherController, SupervisionController],
  providers: [TeacherService, SupervisionService],
})
export class TeacherModule {}
