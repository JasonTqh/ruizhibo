import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StudentWorkflowService } from "./student-workflow.service";

@Module({
  imports: [AuditModule],
  providers: [StudentWorkflowService],
  exports: [StudentWorkflowService],
})
export class WorkflowModule {}
