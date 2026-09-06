import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { LoginAttemptLimiter } from "../src/ports/auth.js";

export class UpstashLoginLimiter implements LoginAttemptLimiter {
  private readonly limiter: Ratelimit;
  constructor(url: string, token: string, requests = 5, window = "15 m") { this.limiter = new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(requests, window as `${number} ${"s" | "m" | "h" | "d"}`), analytics: false }); }
  async consume(key: string) { const result = await this.limiter.limit(`login:${key}`); return result.success ? { allowed: true } : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) }; }
  async reset(key: string) { await this.limiter.resetUsedTokens(`login:${key}`); }
}
