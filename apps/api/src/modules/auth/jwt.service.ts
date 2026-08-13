import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtPayload, WechatBindingPayload } from "./auth.types";

@Injectable()
export class JwtService {
  private readonly expiresInSeconds = 60 * 60 * 24 * 7;

  constructor(private readonly configService: ConfigService) {}

  sign(payload: Omit<JwtPayload, "iat" | "exp">): string {
    return this.signPayload(payload, this.expiresInSeconds);
  }

  signWechatBinding(
    payload: Omit<WechatBindingPayload, "iat" | "exp" | "type">,
  ): string {
    return this.signPayload({ type: "wechat_binding", ...payload }, 10 * 60);
  }

  verifyWechatBinding(token: string): WechatBindingPayload {
    const payload = this.verifyPayload(token) as Partial<WechatBindingPayload>;
    if (
      payload.type !== "wechat_binding" ||
      typeof payload.openid !== "string" ||
      typeof payload.role !== "string"
    ) {
      throw new UnauthorizedException("Invalid binding token");
    }
    return payload as WechatBindingPayload;
  }

  private signPayload(
    payload: Record<string, unknown>,
    expiresInSeconds: number,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signature = this.signInput(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verify(token: string): JwtPayload {
    const payload = this.verifyPayload(token) as Partial<JwtPayload>;
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      throw new UnauthorizedException("Invalid token");
    }
    return payload as JwtPayload;
  }

  private verifyPayload(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedException("Invalid token");
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = this.signInput(
      `${encodedHeader}.${encodedPayload}`,
    );

    if (!this.safeCompare(signature, expectedSignature)) {
      throw new UnauthorizedException("Invalid token");
    }

    const payload = this.parsePayload(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      throw new UnauthorizedException("Token expired");
    }

    return payload;
  }

  private parsePayload(encodedPayload: string): Record<string, unknown> & {
    iat: number;
    exp: number;
  } {
    try {
      const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
      const payload = JSON.parse(raw) as Record<string, unknown>;

      if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
        throw new Error("Invalid token payload");
      }

      return payload as Record<string, unknown> & { iat: number; exp: number };
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  private signInput(input: string): string {
    return createHmac("sha256", this.getSecret())
      .update(input)
      .digest("base64url");
  }

  private getSecret(): string {
    const secret = this.configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new UnauthorizedException("JWT secret is not configured");
    }

    return secret;
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  private safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
