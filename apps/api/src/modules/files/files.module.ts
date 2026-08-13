import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FILE_STORAGE } from "./storage/file-storage";
import { createFileStorage } from "./storage/storage.factory";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FILE_STORAGE, useFactory: createFileStorage },
  ],
})
export class FilesModule {}
