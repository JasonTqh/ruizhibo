import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { getLocalUploadDir } from "./config/storage";
import { AppModule } from "./modules/app.module";
import { ApiExceptionFilter } from "./modules/common/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
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
  });
  app.useStaticAssets(getLocalUploadDir(), {
    prefix: "/uploads/",
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Ruizhibo API listening on http://localhost:${port}/api`);
}

void bootstrap();
