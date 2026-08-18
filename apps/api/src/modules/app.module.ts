import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CareModule } from "./care/care.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { ParentModule } from "./parent/parent.module";
import { PickupModule } from "./pickup/pickup.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TeacherModule } from "./teacher/teacher.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CareModule,
    AdminModule,
    TeacherModule,
    ParentModule,
    PickupModule,
    FilesModule,
    HealthModule,
  ],
})
export class AppModule {}
