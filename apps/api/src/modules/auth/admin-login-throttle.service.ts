import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface AttemptWindow {
  count: number;
  expiresAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const PHONE_LIMIT = 10;
const IP_LIMIT = 30;
const MAX_TRACKED_KEYS = 5_000;

@Injectable()
export class AdminLoginThrottleService {
  private readonly attempts = new Map<string, AttemptWindow>();

  assertAllowed(phone: string, ipAddress: string) {
    this.cleanupExpired();
    if (
      this.currentCount(this.phoneKey(phone)) >= PHONE_LIMIT ||
      this.currentCount(this.ipKey(ipAddress)) >= IP_LIMIT
    ) {
      throw new HttpException(
        "登录尝试次数过多，请 15 分钟后再试",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(phone: string, ipAddress: string) {
    this.increment(this.phoneKey(phone));
    this.increment(this.ipKey(ipAddress));
  }

  recordSuccess(phone: string) {
    this.attempts.delete(this.phoneKey(phone));
  }

  private currentCount(key: string) {
    const value = this.attempts.get(key);
    if (!value || value.expiresAt <= Date.now()) {
      this.attempts.delete(key);
      return 0;
    }
    return value.count;
  }

  private increment(key: string) {
    const now = Date.now();
    const existing = this.attempts.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
      return;
    }
    existing.count += 1;
  }

  private cleanupExpired() {
    if (this.attempts.size < MAX_TRACKED_KEYS) {
      return;
    }
    const now = Date.now();
    for (const [key, value] of this.attempts) {
      if (value.expiresAt <= now) {
        this.attempts.delete(key);
      }
    }

    while (this.attempts.size >= MAX_TRACKED_KEYS) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.attempts.delete(oldestKey);
    }
  }

  private phoneKey(phone: string) {
    return `phone:${phone}`;
  }

  private ipKey(ipAddress: string) {
    return `ip:${ipAddress || "unknown"}`;
  }
}
