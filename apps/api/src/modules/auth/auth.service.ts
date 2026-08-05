import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth.types";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { DevLoginDto } from "./dto/dev-login.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
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

  async wechatLogin(dto: WechatLoginDto) {
    const openid = await this.fetchWechatOpenid(dto.code);
    const user = await this.prisma.user.findUnique({
      where: { wechatOpenid: openid },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Wechat user is not bound");
    }

    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("Invalid login user");
    }

    return this.issueToken({
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    });
  }

  async bindPhone(userId: string, dto: BindPhoneDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("Phone number is already used");
    }

    if (dto.wechatOpenid) {
      const existingOpenid = await this.prisma.user.findFirst({
        where: {
          wechatOpenid: dto.wechatOpenid,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (existingOpenid) {
        throw new ConflictException("Wechat account is already bound");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: dto.phone,
        wechatOpenid: dto.wechatOpenid,
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        status: true,
      },
    });

    return this.issueToken({
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    });
  }

  private issueToken(profile: AuthUser) {
    const token = this.jwtService.sign({ sub: profile.id, role: profile.role });

    return {
      data: {
        token,
        user: profile,
      },
    };
  }

  private async fetchWechatOpenid(code: string) {
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    if (!appId || !appSecret) {
      throw new BadRequestException("Wechat auth is not configured");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException("Wechat auth request failed");
    }

    const data = (await response.json()) as {
      openid?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (!data.openid) {
      throw new BadRequestException(data.errmsg ?? "Wechat login failed");
    }

    return data.openid;
  }
}
