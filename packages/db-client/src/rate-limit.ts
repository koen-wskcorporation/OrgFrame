import { ActionError } from "./errors";

export interface RateLimitKey {
  orgId: string | null;
  userId: string | null;
  action: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimiter {
  check(key: RateLimitKey): Promise<RateLimitDecision> | RateLimitDecision;
}

/** Always-allow limiter — used when no limiter is configured. */
export const noopRateLimiter: RateLimiter = {
  check() {
    return { allowed: true };
  }
};

/**
 * In-memory token-bucket limiter. Per-process only — fine for dev and
 * single-region deploys; swap for a Redis/Postgres-backed limiter at scale.
 */
export function createMemoryRateLimiter(opts: {
  /** Tokens per window. */
  capacity: number;
  /** Window length in milliseconds. */
  windowMs: number;
}): RateLimiter {
  const buckets = new Map<string, { tokens: number; resetAt: number }>();

  return {
    check(key) {
      const id = `${key.orgId ?? "_"}:${key.userId ?? "_"}:${key.action}`;
      const now = Date.now();
      const bucket = buckets.get(id);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(id, { tokens: opts.capacity - 1, resetAt: now + opts.windowMs });
        return { allowed: true };
      }

      if (bucket.tokens <= 0) {
        return { allowed: false, retryAfterMs: bucket.resetAt - now };
      }

      bucket.tokens -= 1;
      return { allowed: true };
    }
  };
}

export function rateLimitError(retryAfterMs?: number): ActionError {
  return new ActionError("rate_limited", "Too many requests, please retry shortly.", {
    retryAfterMs
  });
}
