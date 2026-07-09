import { NextResponse } from 'next/server';
import { resolveAppSessionContext } from '@/lib/authBridge';
import { handleRouteError } from '@/lib/errors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { jsonWithSessionCookie, toTechnicianSession } from '@/lib/sessionRefresh';

export async function GET(request: Request) {
  const rateLimited = await checkRateLimit(request, 'auth.me', RATE_LIMITS.default);
  if (rateLimited) return rateLimited;

  try {
    const { session, jwtPayload } = await resolveAppSessionContext(request);
    if (!session) {
      return NextResponse.json({ session: null }, { status: 401 });
    }

    return jsonWithSessionCookie(
      { session: toTechnicianSession(session) },
      session,
      jwtPayload
    );
  } catch (error) {
    return handleRouteError(error, 'auth.me');
  }
}