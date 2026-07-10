import { NextResponse } from 'next/server';
import { issueApexSessionCookies } from '@/lib/apex/apexSession';
import { buildOwnerDealershipSession } from '@/lib/apex/ownerDealershipContext';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { isLegacyAuthPathEnabled } from '@/lib/authMode';
import { prisma } from '@/lib/db';
import { apiError, handleRouteError } from '@/lib/errors';
import { isApexPlatformMode } from '@/lib/platformMode';
import { checkRateLimit, getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { logApiWriteRequest } from '@/lib/requestLogging';
import { toTechnicianSession } from '@/lib/sessionRefresh';
import {
  AUTH_JSON_BODY_LIMIT_BYTES,
  enterDealershipSchema,
  parseRequestBody,
} from '@/lib/validation';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimited = await checkRateLimit(request, 'auth.enter_dealership', RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  try {
    if (!isLegacyAuthPathEnabled()) {
      return apiError('Enter dealership is disabled. Use Clerk sign-in.', 403);
    }

    if (!isApexPlatformMode()) {
      return apiError('Enter dealership is only available in apex platform mode.', 404);
    }

    return withAuth(
      request,
      async (session) => {
        const parsed = await parseRequestBody(request, enterDealershipSchema, AUTH_JSON_BODY_LIMIT_BYTES);
        if ('error' in parsed) return parsed.error;

        const dealership = await prisma.dealership.findUnique({
          where: { id: parsed.data.dealershipId },
          select: { id: true, name: true },
        });

        if (!dealership) {
          return apiError('Dealership not found.', 404);
        }

        const ownerSession = await buildOwnerDealershipSession(session.technicianId, dealership.id);
        if (!ownerSession) {
          return apiError('Unable to enter dealership context.', 403);
        }

        await writeAuditLog({
          action: 'owner.dealership_enter',
          dealershipId: dealership.id,
          dealerId: auditDealerIdFromSession(ownerSession),
          technicianId: session.technicianId,
          entityType: 'dealership',
          entityId: dealership.id,
          ipAddress: getRequestIp(request),
          authSource: 'legacy',
          scopeMode: 'dealership',
          metadata: {
            previousScopeMode: session.scopeMode ?? 'national',
            dealershipName: dealership.name,
          },
        });

        const response = NextResponse.json({
          session: toTechnicianSession(ownerSession),
          scopeMode: 'dealership' as const,
          activeDealershipId: dealership.id,
          dealershipName: dealership.name,
        });
        await issueApexSessionCookies(response, ownerSession, request, { authSource: 'legacy' });

        logApiWriteRequest({
          routeKey: 'auth.enter_dealership',
          method: request.method,
          status: response.status,
          durationMs: Date.now() - startedAt,
          technicianId: session.technicianId,
          dealershipId: dealership.id,
        });
        return response;
      },
      { requireOwner: true, rateLimitKey: 'auth.enter_dealership', skipRateLimit: true }
    );
  } catch (error) {
    logApiWriteRequest({
      routeKey: 'auth.enter_dealership',
      method: request.method,
      status: 500,
      durationMs: Date.now() - startedAt,
      failed: true,
    });
    return handleRouteError(error, 'auth.enter_dealership');
  }
}