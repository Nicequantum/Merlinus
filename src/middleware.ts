import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BASE_SECURITY_HEADERS, CONTENT_SECURITY_POLICY } from '../security-policy.mjs';
import {
  BOOTSTRAP_PRODUCTION_BLOCKED_MESSAGE,
  BOOTSTRAP_SEED_PATH,
  logBootstrapSeedBlockedAttempt,
} from './lib/bootstrapGuard';
import { isClerkAuthPathEnabled } from './lib/authMode';
import { isProductionRuntime } from './lib/productionRuntime';
import { applySecurityHeaders, isCrossOriginRequest } from './lib/securityHeaders';

/** M12 CSP (security-policy.mjs): default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'. */

/** Routes that must stay public (no session) — login page, auth bootstrap, PWA manifest. */
const PUBLIC_PATHS = new Set([
  '/',
  '/sign-in',
  '/manifest.json',
  '/manifest.webmanifest',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/clerk/link',
  '/api/webhooks/clerk',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith('/sign-in/');
}

function denyCrossOriginApi(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;

  const origin = request.headers.get('origin');
  if (!isCrossOriginRequest(origin, request.nextUrl.origin)) return null;

  const denied = new NextResponse(
    JSON.stringify({ error: 'Cross-origin API access is not permitted.' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
  applySecurityHeaders(denied.headers, BASE_SECURITY_HEADERS);
  denied.headers.set('Vary', 'Origin');
  return denied;
}

function denyBootstrapSeedInProduction(request: NextRequest): NextResponse | null {
  if (!isProductionRuntime()) return null;
  if (request.nextUrl.pathname !== BOOTSTRAP_SEED_PATH) return null;

  logBootstrapSeedBlockedAttempt({ request, layer: 'middleware' });
  const denied = new NextResponse(
    JSON.stringify({ error: BOOTSTRAP_PRODUCTION_BLOCKED_MESSAGE }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
  applySecurityHeaders(denied.headers, BASE_SECURITY_HEADERS);
  return denied;
}

function merlinMiddleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const bootstrapDenied = denyBootstrapSeedInProduction(request);
  if (bootstrapDenied) return bootstrapDenied;

  const crossOriginDenied = denyCrossOriginApi(request);
  if (crossOriginDenied) return crossOriginDenied;

  const response = NextResponse.next();
  applySecurityHeaders(response.headers, BASE_SECURITY_HEADERS);
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (isPublicPath(pathname)) {
    response.headers.set('x-merlin-public-route', '1');
  }

  return response;
}

const middleware = isClerkAuthPathEnabled()
  ? clerkMiddleware((_auth, request) => merlinMiddleware(request))
  : merlinMiddleware;

export default middleware;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};