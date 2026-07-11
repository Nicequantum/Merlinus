/**
 * Phase 7.3 (H14) — shared Story AI route shell.
 * Standardizes: param parse, withAuth, blockServiceAdvisorAi, RO/line load, customer-pay guard.
 */
import 'server-only';

import type { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiRoute';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { RATE_LIMITS, type RateLimitConfig } from '@/lib/rate-limit';
import { loadStoryRouteRepairOrder } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { parseRouteParams, repairOrderLineParamsSchema } from '@/lib/validation';
import type { RepairLine, RepairOrder } from '@/types';
import type { SessionPayload } from '@/lib/auth';

type StoryRouteRo = NonNullable<Awaited<ReturnType<typeof loadStoryRouteRepairOrder>>>;

export interface StoryAiRouteContext {
  request: Request;
  session: SessionPayload;
  repairOrderId: string;
  lineId: string;
  /** Prisma row (encrypted fields) */
  ro: StoryRouteRo;
  /** Decrypted client RO shape */
  mapped: RepairOrder;
  line: RepairLine;
  dbLine: StoryRouteRo['repairLines'][number];
}

export interface StoryAiRouteOptions {
  rateLimitKey: string;
  rateLimit?: RateLimitConfig;
  /** Default true for Grok-backed routes */
  trackUsage?: boolean;
  blockInMaintenance?: boolean;
  perfEvent?: string;
  /**
   * When true (default), reject Customer Pay lines with a 400.
   * Certify/generate/score/review should leave default; set false only if needed.
   */
  rejectCustomerPay?: boolean;
  customerPayMessage?: string;
}

type StoryHandlerResult = NextResponse | Response | Record<string, unknown> | object;

/**
 * Shared shell for generate / score / review / certify style routes.
 * Always sets blockServiceAdvisorAi + requireDealershipContext + requireAuditedAccess defaults via withAuth.
 */
export async function withStoryAiRoute(
  request: Request,
  params: Promise<{ id: string; lineId: string }>,
  options: StoryAiRouteOptions,
  handler: (ctx: StoryAiRouteContext) => Promise<StoryHandlerResult>
): Promise<NextResponse | Response> {
  const routeParams = await parseRouteParams(repairOrderLineParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id: repairOrderId, lineId } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      const ro = await loadStoryRouteRepairOrder(session, repairOrderId);
      if (!ro) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const mapped = dbToRepairOrder(ro);
      const line = mapped.repairLines.find((l) => l.id === lineId);
      if (!line) return apiError(NOT_FOUND_ERROR, 404);

      const dbLine = ro.repairLines.find((l) => l.id === lineId);
      if (!dbLine) return apiError(NOT_FOUND_ERROR, 404);

      if (options.rejectCustomerPay !== false && isCustomerPayRepairLine(dbLine)) {
        return apiError(
          options.customerPayMessage ||
            'This line uses a Customer Pay template. Clear Customer Pay mode to use warranty AI.',
          400
        );
      }

      return handler({
        request,
        session,
        repairOrderId,
        lineId,
        ro,
        mapped,
        line,
        dbLine,
      });
    },
    {
      rateLimitKey: options.rateLimitKey,
      rateLimit: options.rateLimit || RATE_LIMITS.generate,
      trackUsage: options.trackUsage !== false,
      blockInMaintenance: options.blockInMaintenance !== false,
      blockServiceAdvisorAi: true,
      requireDealershipContext: true,
      requireAuditedAccess: true,
      // AI work sits outside DB tx; routes open rlsTransaction around persist only
      useRls: false,
      perfEvent: options.perfEvent,
    }
  );
}
