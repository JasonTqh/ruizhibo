import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminLoginThrottleService } from "./admin-login-throttle.service";
import { AuthUser } from "./auth.types";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { DevLoginDto } from "./dto/dev-login.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { JwtService } from "./jwt.service";
import { hashPassword, verifyPassword } from "./password";

@Injectable()
export class AuthService {
  private wechatAccessTokens = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly dummyAdminPasswordHash = hashPassword(
    "Invalid-Admin-Password-Only-For-Timing!1",
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly adminLoginThrottle: AdminLoginThrottleService,
  ) {}

  async adminLogin(dto: AdminLoginDto, ipAddress: string) {
    this.adminLoginThrottle.assertAllowed(dto.phone, ipAddress);
    const user = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
        role: UserRole.admin,
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        passwordHash: true,
        status: true,
      },
    });

    const passwordHash =
      user?.passwordHash ?? (await this.dummyAdminPasswordHash);
    const passwordMatches = await verifyPassword(dto.password, passwordHash);
    if (
      !user ||
      !user.passwordHash ||
      !passwordMatches ||
      user.status !== UserStatus.active
    ) {
      this.adminLoginThrottle.recordFailure(dto.phone, ipAddress);
      throw new UnauthorizedException("手机号或密码错误");
    }

    this.adminLoginThrottle.recordSuccess(dto.phone);
    const profile: AuthUser = {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    };
    await this.audit.log({
      userId: user.id,
      action: "auth.admin.login",
      targetType: "User",
      targetId: user.id,
      detail: { role: user.role },
    });

    return {
      data: this.issueTokenData(profile),
    };
  }

  async devLogin(dto: DevLoginDto) {
    if (!this.isDevLoginEnabled()) {
      throw new ForbiddenException("Development login is disabled");
    }
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
    return {
      data: this.issueTokenData(profile),
    };
  }

  async wechatLogin(dto: WechatLoginDto) {
    this.assertMiniappRole(dto.role);
    const openid = await this.fetchWechatOpenid(dto.code, dto.role);
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
      return {
        data: {
          status: "binding_required" as const,
          bindingToken: this.jwtService.signWechatBinding({
            openid,
            role: dto.role,
          }),
          expiresIn: 10 * 60,
        },
      };
    }

    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }

    if (user.role !== dto.role) {
      const boundRole = user.role === UserRole.parent ? "家长端" : "教师端";
      throw new ForbiddenException(
        `当前微信账号已绑定${boundRole}，不能用于此端登录`,
      );
    }

    return {
      data: {
        status: "authenticated" as const,
        ...this.issueTokenData({
          id: user.id,
          role: user.role,
          name: user.name,
          phone: user.phone,
        }),
      },
    };
  }

  async bindPhone(dto: BindPhoneDto) {
    this.assertMiniappRole(dto.role);
    const binding = this.jwtService.verifyWechatBinding(dto.bindingToken);
    if (binding.role !== dto.role) {
      throw new ForbiddenException("绑定凭证与当前小程序角色不匹配");
    }

    const phone = await this.fetchWechatPhone(dto.phoneCode, dto.role);
    const user = await this.prisma.user.findFirst({
      where: {
        phone,
        role: dto.role,
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        wechatOpenid: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("未找到匹配账号，请联系管理员创建账号");
    }
    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }
    if (user.wechatOpenid && user.wechatOpenid !== binding.openid) {
      throw new ConflictException("该手机号已绑定其他微信账号");
    }

    const openidOwner = await this.prisma.user.findUnique({
      where: { wechatOpenid: binding.openid },
      select: { id: true },
    });
    if (openidOwner && openidOwner.id !== user.id) {
      throw new ConflictException("当前微信账号已绑定其他用户");
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        wechatOpenid: binding.openid,
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        status: true,
      },
    });

    await this.audit.log({
      userId: updated.id,
      action: "auth.wechat.bind",
      targetType: "User",
      targetId: updated.id,
      detail: { role: updated.role },
    });

    return {
      data: {
        status: "authenticated" as const,
        ...this.issueTokenData({
          id: updated.id,
          role: updated.role,
          name: updated.name,
          phone: updated.phone,
        }),
      },
    };
  }

  private issueTokenData(profile: AuthUser) {
    const payload = { sub: profile.id, role: profile.role };
    const token =
      profile.role === UserRole.admin
        ? this.jwtService.signAdmin(payload)
        : this.jwtService.sign(payload);

    return {
      token,
      user: profile,
    };
  }

  private async fetchWechatOpenid(code: string, role: UserRole) {
    const { appId, appSecret } = this.wechatCredentials(role);

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

  private async fetchWechatPhone(code: string, role: UserRole) {
    const accessToken = await this.wechatAccessToken(role);
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );
    if (!response.ok) {
      throw new BadRequestException("微信手机号授权请求失败");
    }
    const data = (await response.json()) as {
      errcode?: number;
      errmsg?: string;
      phone_info?: { purePhoneNumber?: string; phoneNumber?: string };
    };
    const phone =
      data.phone_info?.purePhoneNumber ?? data.phone_info?.phoneNumber;
    if (data.errcode || !phone || !/^1\d{10}$/.test(phone)) {
      throw new BadRequestException(data.errmsg ?? "微信手机号授权失败");
    }
    return phone;
  }

  private async wechatAccessToken(role: UserRole) {
    const { appId, appSecret } = this.wechatCredentials(role);
    const cached = this.wechatAccessTokens.get(appId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException("微信访问凭证请求失败");
    }
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      errmsg?: string;
    };
    if (!data.access_token) {
      throw new BadRequestException(data.errmsg ?? "微信访问凭证获取失败");
    }
    this.wechatAccessTokens.set(appId, {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    });
    return data.access_token;
  }

  private wechatCredentials(role: UserRole) {
    const prefix = role === UserRole.teacher ? "TEACHER" : "PARENT";
    const appId =
      process.env[`WECHAT_${prefix}_APP_ID`] ?? process.env.WECHAT_APP_ID;
    const appSecret =
      process.env[`WECHAT_${prefix}_APP_SECRET`] ??
      process.env.WECHAT_APP_SECRET;
    if (!appId || !appSecret) {
      throw new BadRequestException("微信登录尚未配置，请联系管理员");
    }
    return { appId, appSecret };
  }

  private assertMiniappRole(role: UserRole) {
    if (role !== UserRole.teacher && role !== UserRole.parent) {
      throw new BadRequestException("微信小程序仅支持教师或家长角色");
    }
  }

  private isDevLoginEnabled() {
    if (process.env.ENABLE_DEV_LOGIN !== undefined) {
      return process.env.ENABLE_DEV_LOGIN === "true";
    }
    return process.env.NODE_ENV !== "production";
  }
}
