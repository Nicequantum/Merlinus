/** Shared public-route definitions for middleware and auth integration tests. */

export const MERLIN_PUBLIC_ROUTE_PATTERNS = [
  '/',
  '/sign-in(.*)',
  '/manifest.json',
  '/manifest.webmanifest',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/clerk/link',
  '/api/webhooks/clerk',
] as const;

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

export function isMerlinPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith('/sign-in/');
}