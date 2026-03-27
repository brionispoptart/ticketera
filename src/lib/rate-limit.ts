import type { NextRequest } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const RATE_LIMIT_STORE_KEY = "__ticketeraRateLimitStore";

function getRateLimitStore() {
  const globalWithStore = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitEntry>;
  };

  if (!globalWithStore[RATE_LIMIT_STORE_KEY]) {
    globalWithStore[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalWithStore[RATE_LIMIT_STORE_KEY];
}

function maybeCleanupExpiredEntries(store: Map<string, RateLimitEntry>, now: number) {
  if (store.size < 500) {
    return;
  }

  for (const [entryKey, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(entryKey);
    }
  }
}

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit({ scope, key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = getRateLimitStore();
  maybeCleanupExpiredEntries(store, now);

  const entryKey = `${scope}:${key}`;
  const existing = store.get(entryKey);
  if (!existing || existing.resetAt <= now) {
    store.set(entryKey, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  store.set(entryKey, existing);

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}