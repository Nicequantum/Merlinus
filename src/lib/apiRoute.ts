import { NextResponse } from 'next/server';
import { withSessionRls } from '@/lib/apex/rlsContext';
import {
  DealershipScopeRequiredError,
  enrichSessionWithTenantScope,
  ownerMayExerciseDealershipPrivilege,
  requireDealershipScope,
  requireOwnerNationalScope,
} from '@/lib/apex/tenantScope';
import { isApexPlatformMode } from '@/lib/platformMode';
import { resolveAppSession, type AuthSource } from './authBridge';
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
import { logPerformance } from './perf';
import { logApiWriteRequest } from './requestLogging';
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from './rate-limit';
import { isDailyUsageLimitReached, logApiUsage } from './usageMonitoring';

type Session = NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>;

export type { AuthSource };

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
  /** APEX Phase 5.5 — owner-only routes (enter/exit dealership, national console). */
  requireOwner?: boolean;
  /**
   * Phase 6.3 — owner routes that require national scope (summary, dealership list).
   * Implies requireOwner. Exit dealership before calling these.
   */
  requireOwnerNational?: boolean;
  /** APEX Phase 5.5 — PII routes; blocks owners in national scope until enter-dealership. */
  requireDealershipContext?: boolean;
  /**
   * Phase 6.1+ — sensitive PII path. Enforces dealership context; handlers must use
   * writeAuditedAccess() (fail-closed) for durable compliance on writes/sensitive reads.
   */
  requireAuditedAccess?: boolean;
  /**
   * Phase 6.2 — wrap handler in withSessionRls (enforced tenant RLS + getRlsDb()).
   * Defaults to true when requireDealershipContext or requireAuditedAccess is set.
   */
  useRls?: boolean;
  /** Emit structured perf log for the route handler duration. */
  perfEvent?: string;
  /** Manager health and similar probes — skip rate limiting so monitoring is not blocked by KV. */
  skipRateLimit?: boolean;
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

  if (!options.skipRateLimit) {
    const rateLimited = await checkRateLimit(
      request,
      routeKey,
      options.rateLimit || (options.trackUsage ? RATE_LIMITS.generate : RATE_LIMITS.default)
    );
    if (rateLimited) return rateLimited;
  }

  const rawSession = await resolveAppSession(request);
  if (!rawSession) {
    return apiError(UNAUTHORIZED_ERROR, 401);
  }

  const session = enrichSessionWithTenantScope(rawSession);

  if (options.requireOwner || options.requireOwnerNational) {
    if (!isApexPlatformMode() || !session.isOwner) {
      return apiError(FORBIDDEN_ERROR, 403);
    }
  }

  if (options.requireOwnerNational) {
    try {
      requireOwnerNationalScope(session);
    } catch (error) {
      if (error instanceof DealershipScopeRequiredError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 403 }
        );
      }
      throw error;
    }
  }

  // Phase 6.1/6.2: audited-access and PII routes require dealership context.
  const needsDealershipContext =
    options.requireDealershipContext || options.requireAuditedAccess;

  if (needsDealershipContext) {
    try {
      requireDealershipScope(session);
    } catch (error) {
      if (error instanceof DealershipScopeRequiredError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 403 }
        );
      }
      throw error;
    }
  }

  // Phase 6.2: PII-heavy routes default to withSessionRls so getRlsDb() is bound.
  // Skip auto-wrap for long AI/maintenance paths (trackUsage / blockInMaintenance) —
  // those routes call rlsTransaction() only around DB work (Grok must not sit in a tx).
  const useRls =
    options.useRls === true ||
    (options.useRls !== false &&
      (options.requireDealershipContext === true || options.requireAuditedAccess === true) &&
      !options.trackUsage &&
      !options.blockInMaintenance);

  if (options.requireManager) {
    if (session.role !== 'manager') {
      return apiError(FORBIDDEN_ERROR, 403);
    }
    // Owners are never managers; belt-and-suspenders for mis-issued sessions.
    if (!ownerMayExerciseDealershipPrivilege(session)) {
      return NextResponse.json(
        {
          error: 'Dealership context required',
          code: 'DEALERSHIP_CONTEXT_REQUIRED',
        },
        { status: 403 }
      );
    }
  }

  if (options.requireAdmin) {
    if (!session.isAdmin) {
      return apiError(FORBIDDEN_ERROR, 403);
    }
    // Phase 6.1: national-scope owners cannot use dealership admin APIs via isAdmin seed flag.
    if (!options.requireOwner && !ownerMayExerciseDealershipPrivilege(session)) {
      return NextResponse.json(
        {
          error: 'Dealership context required for admin operations',
          code: 'DEALERSHIP_CONTEXT_REQUIRED',
        },
        { status: 403 }
      );
    }
  }

  if (!options.skipConsent) {
    if (!session.consentAt) {
      return apiError(CONSENT_REQUIRED_ERROR, 403);
    }
    // M5: getSession already resolved consentVersion from DB — avoid a second lookup.
    if (session.consentVersion !== CONSENT_VERSION) {
      return apiError(CONSENT_REQUIRED_ERROR, 403);
    }
  }

  if (!options.skipLegalDisclaimer) {
    if (!session.legalDisclaimerAt) {
      return apiError(LEGAL_DISCLAIMER_REQUIRED_ERROR, 403);
    }
    if (session.legalDisclaimerVersion !== LEGAL_DISCLAIMER_VERSION) {
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
  const method = request.method;
  try {
    const result = useRls
      ? await withSessionRls(session, async () => handler(session))
      : await handler(session);
    const status = result instanceof NextResponse || result instanceof Response ? result.status : 200;
    const isSuccessResponse = status >= 200 && status < 300;
    if (options.trackUsage && isSuccessResponse) {
      await logApiUsage({
        technicianId: session.technicianId,
        dealershipId: session.dealershipId,
        dealerId: session.dealerId,
        routeKey: routeKey,
      });
    }
    logApiWriteRequest({
      routeKey,
      method,
      status,
      durationMs: Date.now() - startedAt,
      technicianId: session.technicianId,
      dealershipId: session.dealershipId,
    });
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, {
        routeKey,
        technicianId: session.technicianId,
        dealershipId: session.dealershipId,
        status,
      });
    }
    if (result instanceof NextResponse || result instanceof Response) {
      return result;
    }
    return NextResponse.json(result);
  } catch (error) {
    logApiWriteRequest({
      routeKey,
      method,
      status: 500,
      durationMs: Date.now() - startedAt,
      technicianId: session.technicianId,
      dealershipId: session.dealershipId,
      failed: true,
    });
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
  const method = request.method;
  try {
    const result = await handler();
    const status = result instanceof NextResponse || result instanceof Response ? result.status : 200;
    logApiWriteRequest({
      routeKey,
      method,
      status,
      durationMs: Date.now() - startedAt,
    });
    if (options.perfEvent) {
      logPerformance(options.perfEvent, Date.now() - startedAt, { routeKey, status });
    }
    if (result instanceof NextResponse || result instanceof Response) {
      return result;
    }
    return NextResponse.json(result);
  } catch (error) {
    logApiWriteRequest({
      routeKey,
      method,
      status: 500,
      durationMs: Date.now() - startedAt,
      failed: true,
    });
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