import { NextResponse } from 'next/server';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import {
  buildSessionClearCookieHeader,
  clearSessionCookie,
  destroySession,
  getSession,
  SESSION_COOKIE,
} from '@/lib/auth';
import { handleRouteError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkRateLimit, getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';

async function performLogout(request: Request) {
  const session = await getSession(request);

  if (session) {
    await destroySession(session.technicianId);
    await writeAuditLog({
      action: 'auth.logout',
      dealershipId: session.dealershipId,
      dealerId: auditDealerIdFromSession(session),
      technicianId: session.technicianId,
      ipAddress: getRequestIp(request),
    });
    logger.info('auth.logout', { technicianId: session.technicianId });
  } else {
    await clearSessionCookie();
  }

  const response = NextResponse.json(
    { ok: true, session: null },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'Set-Cookie': buildSessionClearCookieHeader(),
      },
    }
  );

  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
    path: '/',
  });

  return response;
}

export async function POST(request: Request) {
  const rateLimited = await checkRateLimit(request, 'auth.logout', RATE_LIMITS.default);
  if (rateLimited) return rateLimited;

  try {
    return await performLogout(request);
  } catch (error) {
    return handleRouteError(error, 'auth.logout');
  }
}

/** M10: GET logout removed — CSRF via img/link prefetch must not clear sessions. */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST /api/auth/logout.' },
    { status: 405, headers: { Allow: 'POST, DELETE' } }
  );
}

export async function DELETE(request: Request) {
  return POST(request);
}