import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * M12: nonce-based CSP with SHA-256 allowlist for Next.js bootstrap inline scripts.
 * Nonce is forwarded on the request so Next.js can tag its own script tags.
 */
const CSP_SCRIPT_HASHES = [
  "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
  "'sha256-csSwIYqEFJP5ArYvYfVBqysAVrn23R3awO21dAl80lY='",
  "'sha256-JCSBLCEoM5/2db8Txoi6b0hpute7zMklsJY+0A27X4g='",
  "'sha256-H/aTaQ3QxY+cKKAYHjD9I1k9gVdxsJt4eyQgJ5TmFiE='",
  "'sha256-vt9GEcKHZMRNvbXQmBW06eGLme2PJOlBAz8X/QKvpe4='",
  "'sha256-tmGlsHL9bVtAMqoAs0i59hY3q39nBRRCBkOcIqrO7iM='",
  "'sha256-Kfi+eUP9/4InBB40ldCK+O+u1qvd5SflonfATDqIclE='",
  "'sha256-bg+CWjI8RppcgHYH6RuW4z4OnLAUEUPDXRoYUo9Tyok='",
] as const;

function buildContentSecurityPolicy(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https://cdn.jsdelivr.net',
    ...CSP_SCRIPT_HASHES,
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' blob: https://api.x.ai https://*.google.com https://*.gstatic.com wss://*.google.com",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "child-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and PWA manifest (served without CSP middleware so manifest.json
     * is not blocked or mis-authenticated on edge).
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};