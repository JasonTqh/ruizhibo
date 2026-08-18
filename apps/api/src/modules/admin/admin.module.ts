import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AuditModule, AuthModule, PrismaModule, WorkflowModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
