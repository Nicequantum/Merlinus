import { NextResponse } from 'next/server';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { applySessionCookieToResponse, createSessionToken, loginTechnician } from '@/lib/auth';
import { apiError, handleRouteError } from '@/lib/errors';
import { checkRateLimit, getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { logApiWriteRequest } from '@/lib/requestLogging';
import { AUTH_JSON_BODY_LIMIT_BYTES, loginSchema, parseRequestBody } from '@/lib/validation';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimited = await checkRateLimit(request, 'auth.login', RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  try {
    const parsed = await parseRequestBody(request, loginSchema, AUTH_JSON_BODY_LIMIT_BYTES);
    if ('error' in parsed) {
      return parsed.error;
    }

    const { d7Number, password } = parsed.data;
    const session = await loginTechnician(d7Number, password);
    if (!session) {
      return apiError('Invalid D7 number or password.', 401);
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
    });

    const response = NextResponse.json({ session });
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