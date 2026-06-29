import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { isMaintenanceModeEnabled } from './env';
import {
  apiError,
  CONSENT_REQUIRED_ERROR,
  DAILY_USAGE_LIMIT_ERROR,
  FORBIDDEN_ERROR,
  GENERIC_ERROR,
  handleRouteError,
  LEGAL_DISCLAIMER_REQUIRED_ERROR,
  MAINTENANCE_MODE_ERROR,
  UNAUTHORIZED_ERROR,
} from './errors';
import { CONSENT_VERSION, LEGAL_DISCLAIMER_VERSION } from '@/types';
import { prisma } from './db';
import { logPerformance } from './perf';
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from './rate-limit';
import { isDailyUsageLimitReached, logApiUsage } from './usageMonitoring';

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

interface RouteOptions {
  rateLimitKey?: string;
  rateLimit?: RateLimitConfig;
  requireManager?: boolean;
  requireAdmin?: boolean;
  /** Count toward per-technician daily AI usage (50/day) and persist to UsageLog. */
  trackUsage?: boolean;
  /** When true, allow the route before privacy consent is recorded (e.g. POST /api/consent). */
  skipConsent?: boolean;
  /** When true, allow the route before legal disclaimer is recorded (e.g. POST /api/legal-disclaimer). */
  skipLegalDisclaimer?: boolean;
  /** Block when MERLIN_MAINTENANCE_MODE is enabled (AI and heavy write paths). */
  blockInMaintenance?: boolean;
  /** Emit structured perf log for the route handler duration. */
  perfEvent?: string;
}

export async function withAuth<T>(
  request: Request,
  handler: (session: Session) => Promise<T>,
  options: RouteOptions = {}
): Promise<NextResponse | Response> {
  const routeKey = options.rateLimitKey || 'api';

  if (options.blockInMaintenance && isMaintenanceModeEnabled()) {
    return apiError(MAINTENANCE_MODE_ERROR, 503);
  }

  const rateLimited = await checkRateLimit(
    request,
    routeKey,
    options.rateLimit || (options.trackUsage ? RATE_LIMITS.generate : RATE_LIMITS.default)
  );
  if (rateLimited) return rateLimited;

  const session = await getSession(request);
  if (!session) {
    return apiError(UNAUTHORIZED_ERROR, 401);
  }

  if (options.requireManager && session.role !== 'manager') {
    return apiError(FORBIDDEN_ERROR, 403);
  }

  if (options.requireAdmin && !session.isAdmin) {
    return apiError(FORBIDDEN_ERROR, 403);
  }

  if (!options.skipConsent) {
    if (!session.consentAt) {
      return apiError(CONSENT_REQUIRED_ERROR, 403);
    }
    // H-FINAL-6: policy updates require re-consent when CONSENT_VERSION changes.
    const consentRecord = await prisma.technician.findUnique({
      where: { id: session.technicianId },
      select: { consentVersion: true },
    });
    if (consentRecord?.consentVersion !== CONSENT_VERSION) {
      return apiError(CONSENT_REQUIRED_ERROR, 403);
    }
  }

  if (!options.skipLegalDisclaimer) {
    if (!session.legalDisclaimerAt) {
      return apiError(LEGAL_DISCLAIMER_REQUIRED_ERROR, 403);
    }
    const disclaimerRecord = await prisma.technician.findUnique({
      where: { id: session.technicianId },
      select: { legalDisclaimerVersion: true },
    });
    if (disclaimerRecord?.legalDisclaimerVersion !== LEGAL_DISCLAIMER_VERSION) {
      return apiError(LEGAL_DISCLAIMER_REQUIRED_ERROR, 403);
    }
  }

  if (options.trackUsage) {
    const limitReached = await isDailyUsageLimitReached(session.technicianId);
    if (limitReached) {
      return apiError(DAILY_USAGE_LIMIT_ERROR, 429);
    }
  }

  const startedAt = Date.now();
  try {
    const result = await handler(session);
    const isSuccessResponse =
      !(result instanceof NextResponse || result instanceof Response) ||
      (result.status >= 200 && result.status < 300);
    if (options.trackUsage && isSuccessResponse) {
      await logApiUsage({
        technicianId: session.technicianId,
        dealershipId: session.dealershipId,
        routeKey: routeKey,
      });
    }
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, {
        routeKey,
        technicianId: session.technicianId,
        dealershipId: session.dealershipId,
        status: result instanceof NextResponse || result instanceof Response ? result.status : 200,
      });
    }
    if (result instanceof NextResponse || result instanceof Response) {
      return result;
    }
    return NextResponse.json(result);
  } catch (error) {
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, {
        routeKey,
        technicianId: session.technicianId,
        failed: true,
      });
    }
    return handleRouteError(error, routeKey);
  }
}

export async function withPublicRoute<T>(
  request: Request,
  handler: () => Promise<T>,
  options: RouteOptions = {}
): Promise<NextResponse | Response> {
  const routeKey = options.rateLimitKey || 'public';

  if (options.blockInMaintenance && isMaintenanceModeEnabled()) {
    return apiError(MAINTENANCE_MODE_ERROR, 503);
  }

  const rateLimited = await checkRateLimit(
    request,
    routeKey,
    options.rateLimit || RATE_LIMITS.default
  );
  if (rateLimited) return rateLimited;

  const startedAt = Date.now();
  try {
    const result = await handler();
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, { routeKey });
    }
    if (result instanceof NextResponse || result instanceof Response) {
      return result;
    }
    return NextResponse.json(result);
  } catch (error) {
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, { routeKey, failed: true });
    }
    return handleRouteError(error, routeKey);
  }
}

export function jsonError(message: string, status: number): NextResponse {
  return apiError(message, status);
}

export { GENERIC_ERROR };