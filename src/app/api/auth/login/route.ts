import { NextResponse } from 'next/server';
import { INVALID_CREDENTIALS_MESSAGE } from '@/lib/apex/credentialType';
import {
  createPendingSelectionToken,
  issueApexSessionCookies,
} from '@/lib/apex/apexSession';
import {
  LEGACY_LOGIN_FAILURE_MESSAGE,
  resolveUnifiedLogin,
} from '@/lib/apex/loginResolver';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { applySessionCookieToResponse, createSessionToken, loginTechnician } from '@/lib/auth';
import { isLegacyAuthPathEnabled } from '@/lib/authMode';
import { isApexPlatformMode } from '@/lib/platformMode';
import { apiError, handleRouteError } from '@/lib/errors';
import { checkRateLimit, getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { logApiWriteRequest } from '@/lib/requestLogging';
import { AUTH_JSON_BODY_LIMIT_BYTES, loginRequestSchema, parseRequestBody } from '@/lib/validation';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimited = await checkRateLimit(request, 'auth.login', RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  try {
    if (!isLegacyAuthPathEnabled()) {
      return apiError('Legacy D7 login is disabled. Use Clerk sign-in.', 403);
    }

    const parsed = await parseRequestBody(request, loginRequestSchema, AUTH_JSON_BODY_LIMIT_BYTES);
    if ('error' in parsed) {
      return parsed.error;
    }

    const { identifier, password } = parsed.data;
    const apexMode = isApexPlatformMode();

    if (!apexMode) {
      const session = await loginTechnician(identifier, password);
      if (!session) {
        return apiError(LEGACY_LOGIN_FAILURE_MESSAGE, 401);
      }

      const token = await createSessionToken(session);

      await writeAuditLog({
        action: 'auth.login',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: session.technicianId,
        ipAddress: getRequestIp(request),
        authSource: 'legacy',
      });

      const response = NextResponse.json({ session, authSource: 'legacy' as const });
      applySessionCookieToResponse(response, token);
      logApiWriteRequest({
        routeKey: 'auth.login',
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        technicianId: session.technicianId,
        dealershipId: session.dealershipId,
      });
      return response;
    }

    const loginResult = await resolveUnifiedLogin(identifier, password);
    if (loginResult.status === 'invalid') {
      return apiError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    if (loginResult.status === 'select_dealership') {
      const pendingToken = await createPendingSelectionToken({
        technicianId: loginResult.technicianId,
        credentialType: loginResult.credentialType,
        sessionVersion: loginResult.sessionVersion,
      });

      const response = NextResponse.json({
        requiresDealershipSelection: true,
        pendingToken,
        technicianId: loginResult.technicianId,
        credentialType: loginResult.credentialType,
        dealerships: loginResult.dealerships,
      });
      logApiWriteRequest({
        routeKey: 'auth.login',
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        technicianId: loginResult.technicianId,
      });
      return response;
    }

    const { session } = loginResult;

    await writeAuditLog({
      action: 'auth.login',
      dealershipId: session.dealershipId,
      dealerId: auditDealerIdFromSession(session),
      technicianId: session.technicianId,
      entityType: 'technician',
      entityId: session.technicianId,
      ipAddress: getRequestIp(request),
      authSource: 'legacy',
      scopeMode: session.role === 'owner' ? 'national' : 'dealership',
      metadata: { credentialType: loginResult.credentialType },
    });

    const response = NextResponse.json({
      session,
      authSource: 'legacy' as const,
      credentialType: loginResult.credentialType,
    });
    await issueApexSessionCookies(response, session, request, { authSource: 'legacy' });
    logApiWriteRequest({
      routeKey: 'auth.login',
      method: request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
      technicianId: session.technicianId,
      dealershipId: session.dealershipId,
    });
    return response;
  } catch (error) {
    logApiWriteRequest({
      routeKey: 'auth.login',
      method: request.method,
      status: 500,
      durationMs: Date.now() - startedAt,
      failed: true,
    });
    return handleRouteError(error, 'auth.login');
  }
}