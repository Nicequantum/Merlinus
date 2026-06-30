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

export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
  /** All Grok-backed routes (story, review, RO/diagnostic extract) share this ceiling. */
  generate: { limit: 20, windowMs: 60_000 },
  grok: { limit: 20, windowMs: 60_000 },
  default: { limit: 60, windowMs: 60_000 },
} as const;

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_REGEX = /^[0-9a-f:]+$/i;

function isValidIp(value: string): boolean {
  return IPV4_REGEX.test(value) || (value.includes(':') && IPV6_REGEX.test(value));
}

/**
 * M14: Prefer platform-trusted headers; do not blindly trust client-spoofable X-Forwarded-For leftmost hop.
 */
export function getClientIp(request: Request): string {
  const vercel = request.headers.get('x-vercel-forwarded-for')?.trim();
  if (vercel && isValidIp(vercel)) return vercel;

  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf && isValidIp(cf)) return cf;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && isValidIp(realIp)) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const trustedHops = Number(process.env.TRUSTED_PROXY_HOPS ?? '1');
    const index = Math.max(0, hops.length - trustedHops);
    const candidate = hops[index];
    if (candidate && isValidIp(candidate)) return candidate;
  }

  return 'unknown';
}

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

/**
 * Production deployment — excludes test/dev runtimes even when VERCEL_ENV is set (e.g. CI).
 */
export function isProductionEnv(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'test' || nodeEnv === 'development') {
    return false;
  }
  return nodeEnv === 'production' || process.env.VERCEL_ENV === 'production';
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
      logger.warn('rate_limit.kv_fallback', {
        routeKey,
        error: error instanceof Error ? error.message : 'unknown',
      });
      // Transient KV errors: per-instance memory preserves 429 behavior and limit values.
      return checkMemoryRateLimit(key, config);
    }
  }

  if (!isProductionEnv()) {
    return checkMemoryRateLimit(key, devMemoryRateLimitConfig(config));
  }

  // Production without KV: fail closed — do not serve unbounded AI/auth traffic.
  logger.error('rate_limit.kv_required', {
    routeKey,
    detail: 'KV_REST_API_URL/TOKEN not configured in production — request blocked',
  });
  return apiError(
    'Service temporarily unavailable. Contact your administrator to configure rate limiting.',
    503
  );
}

export function getRequestIp(request: Request): string {
  return getClientIp(request);
}