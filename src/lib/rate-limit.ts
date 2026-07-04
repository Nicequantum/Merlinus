/**
 * Distributed per-IP rate limiting for API routes (KV INCR + EXPIRE sliding window).
 *
 * Production (`NODE_ENV` or `VERCEL_ENV` = production):
 * - Requires `KV_REST_API_URL` + `KV_REST_API_TOKEN` (enforced at build via validate-env.mjs).
 * - Missing or unreachable KV fails closed with HTTP 503 — no in-memory fallback.
 *
 * Development:
 * - Without KV: per-instance in-memory limits (halved vs production values).
 * - With KV configured but transient errors: dev-only memory fallback with warning log.
 *
 * Routes pass a stable `routeKey` plus an optional limit override through `withAuth` / `checkRateLimit`.
 */
import { apiError, RATE_LIMIT_ERROR } from './errors';
import { logger } from './logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/** Per-IP request ceilings (requests per `windowMs`). Override per route via `checkRateLimit` options. */
export const RATE_LIMITS = {
  /** Login, logout, seed — brute-force protection. */
  auth: { limit: 10, windowMs: 60_000 },
  /** Image blob uploads. */
  upload: { limit: 30, windowMs: 60_000 },
  /** Grok-backed routes: story generate/review/score, RO + diagnostic vision extract. */
  generate: { limit: 20, windowMs: 60_000 },
  grok: { limit: 20, windowMs: 60_000 },
  /** General authenticated API traffic. */
  default: { limit: 60, windowMs: 60_000 },
} as const;

export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  'Service temporarily unavailable. Contact your administrator to configure rate limiting.';

import { getClientIp, getRequestIp } from './requestIp';

export { getClientIp, getRequestIp };

function checkMemoryRateLimit(key: string, config: RateLimitConfig): Response | null {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now >= entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  if (entry.count >= config.limit) {
    return apiError(RATE_LIMIT_ERROR, 429);
  }

  entry.count += 1;
  return null;
}

async function checkKvRateLimit(key: string, config: RateLimitConfig): Promise<Response | null> {
  const { kv } = await import('@vercel/kv');
  const count = await kv.incr(key);

  if (count === 1) {
    await kv.expire(key, Math.max(1, Math.ceil(config.windowMs / 1000)));
  }

  if (count > config.limit) {
    return apiError(RATE_LIMIT_ERROR, 429);
  }

  return null;
}

export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

/** GitHub Actions / local test runners — never treat as production for fail-closed paths. */
export function isCiOrTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true'
  );
}

/**
 * Production deployment — excludes test/dev/CI even when VERCEL_ENV is set (e.g. ready-to-deploy step).
 */
export function isProductionEnv(): boolean {
  if (isCiOrTestRuntime() || process.env.NODE_ENV === 'development') {
    return false;
  }
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function rateLimitUnavailableResponse(): Response {
  return apiError(RATE_LIMIT_UNAVAILABLE_MESSAGE, 503);
}

function logKvRateLimitError(routeKey: string, ip: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : 'unknown';
  const context = {
    routeKey,
    ip: ip === 'unknown' ? undefined : ip,
    error: errorMessage,
  };
  if (isProductionEnv()) {
    logger.error('rate_limit.kv_unavailable', context);
    return;
  }
  logger.warn('rate_limit.kv_fallback_dev', context);
}

/** Dev-only: weaker per-instance limits when KV is not configured locally. */
function devMemoryRateLimitConfig(config: RateLimitConfig): RateLimitConfig {
  if (isKvConfigured()) return config;
  return {
    limit: Math.max(1, Math.floor(config.limit / 2)),
    windowMs: config.windowMs,
  };
}

export async function checkRateLimit(
  request: Request,
  routeKey: string,
  config: RateLimitConfig = RATE_LIMITS.default
): Promise<Response | null> {
  const ip = getClientIp(request);
  const key = `ratelimit:${routeKey}:${ip === 'unknown' ? 'unknown' : ip}`;

  if (isKvConfigured()) {
    try {
      return await checkKvRateLimit(key, config);
    } catch (error) {
      logKvRateLimitError(routeKey, ip, error);
      if (isProductionEnv()) {
        return rateLimitUnavailableResponse();
      }
      // Dev-only: preserve local iteration when KV is misconfigured or briefly unavailable.
      return checkMemoryRateLimit(key, devMemoryRateLimitConfig(config));
    }
  }

  if (!isProductionEnv()) {
    return checkMemoryRateLimit(key, devMemoryRateLimitConfig(config));
  }

  logger.error('rate_limit.kv_required', {
    routeKey,
    ip: ip === 'unknown' ? undefined : ip,
    detail: 'KV_REST_API_URL/TOKEN not configured in production — request blocked',
  });
  return rateLimitUnavailableResponse();
}

