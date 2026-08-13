import { Controller, Get } from "@nestjs/common";
import { getFileStorageDriver } from "../../config/storage";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      data: {
        status: "ok",
        service: "ruizhibo-api",
        database: "ok",
        fileStorage: getFileStorageDriver(),
        checkedAt: new Date().toISOString(),
      },
    };
  }
}
