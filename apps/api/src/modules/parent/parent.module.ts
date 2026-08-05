import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ParentController } from "./parent.controller";
import { ParentService } from "./parent.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ParentController],
  providers: [ParentService],
})
export class ParentModule {}
