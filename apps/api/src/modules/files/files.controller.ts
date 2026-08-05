import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { FilesService } from "./files.service";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("files")
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadFileDto) {
    return this.filesService.upload(user.id, dto);
  }
}
