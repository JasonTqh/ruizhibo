import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { getFileStorageDriver, getLocalUploadDir } from "./config/storage";
import { AppModule } from "./modules/app.module";
import { ApiExceptionFilter } from "./modules/common/api-exception.filter";
import { writeOperationalLog } from "./modules/common/operational-logger";
import {
  REQUEST_ID_HEADER,
  requestContextMiddleware,
} from "./modules/common/request-context";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: false,
  });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (
    Number.isInteger(trustProxyHops) &&
    trustProxyHops > 0 &&
    trustProxyHops <= 5
  ) {
    app.set("trust proxy", trustProxyHops);
  }
  app.use(requestContextMiddleware);
  app.use(json({ limit: "15mb" }));
  app.use(urlencoded({ extended: true, limit: "15mb" }));
  app.setGlobalPrefix("api");
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin:
      corsOrigins.length > 0
        ? corsOrigins
        : process.env.NODE_ENV === "production"
          ? false
          : true,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  if (getFileStorageDriver() === "local") {
    app.useStaticAssets(getLocalUploadDir(), {
      prefix: "/uploads/",
    });
  }
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  app.enableShutdownHooks();
  await app.listen(port);
  writeOperationalLog("info", "service_started", {
    port,
    environment: process.env.NODE_ENV ?? "development",
    fileStorage: getFileStorageDriver(),
  });
}

void bootstrap().catch((exception: unknown) => {
  writeOperationalLog("error", "service_start_failed", {
    errorType:
      exception instanceof Error
        ? exception.constructor.name
        : typeof exception,
  });
  process.exitCode = 1;
});
