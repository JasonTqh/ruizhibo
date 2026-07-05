import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth.types";
import { DevLoginDto } from "./dto/dev-login.dto";
import { JwtService } from "./jwt.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async devLogin(dto: DevLoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
        role: dto.role,
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException("Invalid login user");
    }

    const profile: AuthUser = {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    };
    const token = this.jwtService.sign({ sub: user.id, role: user.role });

    return {
      data: {
        token,
        user: profile,
      },
    };
  }
}
