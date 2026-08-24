import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAdminController } from "./training-admin.controller";
import { TrainingAdminService } from "./training-admin.service";
import { TrainingAssignmentService } from "./training-assignment.service";
import { TrainingAuditService } from "./training-audit.service";
import { TrainingCourseService } from "./training-course.service";
import { TrainingExportService } from "./training-export.service";
import { TrainingJobsService } from "./training-jobs.service";
import { TrainingLifecycleService } from "./training-lifecycle.service";
import { TrainingPracticalService } from "./training-practical.service";
import { TrainingSafetyService } from "./training-safety.service";
import { TrainingTeacherController } from "./training-teacher.controller";
import { TrainingTeacherService } from "./training-teacher.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TrainingAdminController, TrainingTeacherController],
  providers: [
    TrainingAccessService,
    TrainingAdminService,
    TrainingAssignmentService,
    TrainingAuditService,
    TrainingCourseService,
    TrainingExportService,
    TrainingJobsService,
    TrainingLifecycleService,
    TrainingPracticalService,
    TrainingSafetyService,
    TrainingTeacherService,
  ],
  exports: [TrainingAssignmentService],
})
export class TrainingModule {}
