/**
 * Distributed per-IP rate limiting for API routes (KV INCR + EXPIRE sliding window).
 *
 * Vercel production (`VERCEL` = 1 and `VERCEL_ENV` = production):
 * - Missing KV: in-memory limits (per-instance) — app routes stay available until KV is wired up.
 * - KV configured but unreachable: fail closed on non-auth routes (HTTP 503); auth bootstrap falls back.
 *
 * Local dev / CI / `next start`:
 * - Without KV: per-instance in-memory limits (halved vs production values).
 * - With KV configured but transient errors: memory fallback with warning log.
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

/** Auth, compliance, and core dashboard bootstrap routes must never fail closed when KV is absent or unreachable. */
const NEVER_FAIL_CLOSED_ROUTE_KEYS = new Set([
  'auth.login',
  'auth.logout',
  'auth.me',
  'setup.seed',
  'legal_disclaimer',
  'dashboard.summary',
  'ros.list',
]);

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
 * True only on a live Vercel production deployment. Local `next start` / `vercel env pull` may set
 * `VERCEL_ENV=production` without `VERCEL=1` — those runtimes must degrade to in-memory limits.
 */
export function isProductionEnv(): boolean {
  if (isCiOrTestRuntime() || process.env.NODE_ENV === 'development') {
    return false;
  }
  if (process.env.VERCEL !== '1') {
    return false;
  }
  return process.env.VERCEL_ENV === 'production';
}

/** Loopback or RFC1918 host — local dev, next start, vercel dev, shop-floor LAN tablets. */
export function isLocalhostRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
    if (hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const octets = ipv4.slice(1, 5).map((part) => Number(part));
    if (octets.some((part) => part > 255)) return false;
    const [a, b] = octets;
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

function shouldFailClosedWithoutKv(request: Request, routeKey: string): boolean {
  if (NEVER_FAIL_CLOSED_ROUTE_KEYS.has(routeKey)) {
    return false;
  }
  if (isLocalhostRequest(request)) {
    return false;
  }
  return isProductionEnv();
}

export function getRateLimitRuntimeSnapshot(request: Request, routeKey: string) {
  return {
    requestUrl: request.url,
    routeKey,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercel: process.env.VERCEL ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    kvConfigured: isKvConfigured(),
    isProductionEnv: isProductionEnv(),
    isLocalhost: isLocalhostRequest(request),
    authBootstrapRoute: NEVER_FAIL_CLOSED_ROUTE_KEYS.has(routeKey),
    failClosedWithoutKv: shouldFailClosedWithoutKv(request, routeKey),
  };
}

function logRateLimitDecision(
  routeKey: string,
  request: Request,
  decision: 'kv' | 'memory' | 'kv_fallback_memory' | 'fail_closed_kv_unavailable'
): void {
  logger.info('rate_limit.check', {
    decision,
    ...getRateLimitRuntimeSnapshot(request, routeKey),
  });
}

function rateLimitUnavailableResponse(): Response {
  return apiError(RATE_LIMIT_UNAVAILABLE_MESSAGE, 503);
}

function logKvRateLimitError(routeKey: string, request: Request, ip: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : 'unknown';
  const context = {
    ip: ip === 'unknown' ? undefined : ip,
    error: errorMessage,
    ...getRateLimitRuntimeSnapshot(request, routeKey),
  };
  if (shouldFailClosedWithoutKv(request, routeKey)) {
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

  if (!isKvConfigured()) {
    if (shouldFailClosedWithoutKv(request, routeKey)) {
      logger.warn('rate_limit.kv_required', {
        ip: ip === 'unknown' ? undefined : ip,
        detail: 'KV_REST_API_URL/TOKEN not configured in production — using in-memory rate limits',
        ...getRateLimitRuntimeSnapshot(request, routeKey),
      });
    }
    logRateLimitDecision(routeKey, request, 'memory');
    return checkMemoryRateLimit(key, devMemoryRateLimitConfig(config));
  }

  try {
    const result = await checkKvRateLimit(key, config);
    logRateLimitDecision(routeKey, request, 'kv');
    return result;
  } catch (error) {
    logKvRateLimitError(routeKey, request, ip, error);
    if (shouldFailClosedWithoutKv(request, routeKey)) {
      logRateLimitDecision(routeKey, request, 'fail_closed_kv_unavailable');
      return rateLimitUnavailableResponse();
    }
    logRateLimitDecision(routeKey, request, 'kv_fallback_memory');
    return checkMemoryRateLimit(key, devMemoryRateLimitConfig(config));
  }
}

