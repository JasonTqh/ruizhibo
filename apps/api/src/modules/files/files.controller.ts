import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { diskStorage } from "multer";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  FilesService,
  TRAINING_IMAGE_MIME_TYPES,
  TRAINING_VIDEO_MIME_TYPE,
  trainingUploadMaxBytes,
  type UploadedTrainingFile,
} from "./files.service";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("files")
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadFileDto) {
    return this.filesService.upload(user.id, dto);
  }

  @Get("training/limits")
  trainingLimits(@CurrentUser() user: AuthUser) {
    return this.filesService.trainingLimits(user.id);
  }

  @Post("training")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_request, _file, callback) =>
          callback(null, `ruizhibo-training-${randomUUID()}.upload`),
      }),
      limits: { fileSize: trainingUploadMaxBytes(), files: 1 },
      fileFilter: (_request, file, callback) => {
        const allowed =
          TRAINING_IMAGE_MIME_TYPES.has(file.mimetype) ||
          file.mimetype === TRAINING_VIDEO_MIME_TYPE;
        callback(
          allowed ? null : new BadRequestException("培训素材类型不受支持"),
          allowed,
        );
      },
    }),
  )
  uploadTraining(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedTrainingFile,
  ) {
    return this.filesService.uploadTraining(user.id, file);
  }

  @Get("training/:assetId/access")
  trainingAccess(
    @CurrentUser() user: AuthUser,
    @Param("assetId") assetId: string,
  ) {
    return this.filesService.createTrainingAccessUrl(user.id, assetId);
  }
}

@Controller("files/training")
export class TrainingMediaController {
  constructor(private readonly filesService: FilesService) {}

  @Get(":assetId/content")
  async content(
    @Param("assetId") assetId: string,
    @Query("actorId") actorId: string,
    @Query("expires") expires: string,
    @Query("nonce") nonce: string,
    @Query("signature") signature: string,
    @Headers("range") rangeHeader: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.filesService.openTrainingAsset(
      assetId,
      actorId,
      expires,
      nonce,
      signature,
      rangeHeader,
    );
    response.setHeader("Content-Type", result.asset.mimeType);
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (result.range) {
      response.status(206);
      response.setHeader(
        "Content-Range",
        `bytes ${result.range.start}-${result.range.end}/${result.range.size}`,
      );
      response.setHeader(
        "Content-Length",
        String(result.range.end - result.range.start + 1),
      );
    } else if (result.asset.size) {
      response.setHeader("Content-Length", String(result.asset.size));
    }
    result.opened.body.pipe(response);
  }
}
