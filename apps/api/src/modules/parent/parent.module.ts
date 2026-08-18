import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { ParentController } from "./parent.controller";
import { ParentService } from "./parent.service";

@Module({
  imports: [AuditModule, AuthModule, PrismaModule, WorkflowModule],
  controllers: [ParentController],
  providers: [ParentService],
})
export class ParentModule {}
