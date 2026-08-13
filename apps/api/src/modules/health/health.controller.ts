import { Controller, Get } from "@nestjs/common";
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
        checkedAt: new Date().toISOString(),
      },
    };
  }
}
