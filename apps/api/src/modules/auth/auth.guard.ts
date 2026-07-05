import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth.types";
import { JwtService } from "./jwt.service";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    const payload = this.jwtService.verify(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.active || user.role !== payload.role) {
      throw new UnauthorizedException("User is not allowed to access this resource");
    }

    request.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    };

    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    return token;
  }
}
