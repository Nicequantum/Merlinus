import 'server-only';

import { auth } from '@clerk/nextjs/server';
import type { SessionPayload } from '@/lib/auth';
import { enrichSessionWithTenantScope } from '@/lib/apex/tenantScope';
import { resolvePlatformSessionContext } from '@/lib/apex/platformSession';
import { attemptClerkEmailLinkOnSignIn, loadLinkedTechnicianSession } from '@/lib/clerkIdentity';
import { isClerkAuthPathEnabled, isLegacyAuthPathEnabled } from '@/lib/authMode';
import { isApexPlatformMode } from '@/lib/platformMode';
import { logger } from '@/lib/logger';

export type AuthSource = 'clerk' | 'legacy';

export interface AppSessionContext {
  session: SessionPayload | null;
  /** How the session was authenticated — null when unauthenticated. */
  source: AuthSource | null;
  /** Legacy JWT claims for cookie refresh; null for Clerk sessions. */
  jwtPayload: SessionPayload | null;
}

async function tryResolveClerkSession(): Promise<SessionPayload | null> {
  if (!isClerkAuthPathEnabled()) return null;

  try {
    const { userId } = await auth();
    if (!userId) return null;

    const linked = await loadLinkedTechnicianSession(userId);
    if (linked) return linked;

    return attemptClerkEmailLinkOnSignIn(userId);
  } catch (error) {
    logger.warn('auth.clerk_session_resolve_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Unified session resolver.
 *
 * Apex mode: prefer apex_access dual-token cookies (password / refresh / owner national)
 * before Clerk so AUTH_MODE=dual does not mask a successful owner email login.
 *
 * Merlinus: Clerk (when enabled and linked) then legacy benz_tech_session JWT.
 */
export async function resolveAppSessionContext(request?: Request): Promise<AppSessionContext> {
  if (isLegacyAuthPathEnabled() && isApexPlatformMode()) {
    const apex = await resolvePlatformSessionContext(request);
    if (apex.session) {
      return {
        session: apex.session,
        source: 'legacy',
        jwtPayload: apex.jwtPayload as SessionPayload | null,
      };
    }
  }

  const clerkSession = await tryResolveClerkSession();
  if (clerkSession) {
    return { session: clerkSession, source: 'clerk', jwtPayload: null };
  }

  if (!isLegacyAuthPathEnabled()) {
    return { session: null, source: null, jwtPayload: null };
  }

  // Merlinus legacy JWT (or apex when cookies were missing above)
  const legacy = await resolvePlatformSessionContext(request);
  return {
    session: legacy.session,
    source: legacy.session ? 'legacy' : null,
    jwtPayload: legacy.jwtPayload as SessionPayload | null,
  };
}

export async function resolveAppSession(request?: Request): Promise<SessionPayload | null> {
  const { session } = await resolveAppSessionContext(request);
  return session ? enrichSessionWithTenantScope(session) : null;
}

/** Legacy JWT session only — used for Clerk manual-link flows alongside Clerk auth(). */
export async function resolveLegacySessionContext(request?: Request) {
  return resolvePlatformSessionContext(request);
}

export async function requireAppSession(request?: Request): Promise<SessionPayload> {
  const session = await resolveAppSession(request);
  if (!session) throw new Error('Unauthorized');
  return session;
}