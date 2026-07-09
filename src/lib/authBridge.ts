import 'server-only';

import { auth } from '@clerk/nextjs/server';
import {
  getSessionContext,
  type SessionPayload,
} from '@/lib/auth';
import { attemptClerkEmailLinkOnSignIn, loadLinkedTechnicianSession } from '@/lib/clerkIdentity';
import { isClerkAuthPathEnabled, isLegacyAuthPathEnabled } from '@/lib/authMode';
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
 * Unified session resolver — Clerk (when enabled and linked) then legacy JWT.
 * MERLINUS: default AUTH_MODE=legacy behaves exactly like getSessionContext today.
 */
export async function resolveAppSessionContext(request?: Request): Promise<AppSessionContext> {
  const clerkSession = await tryResolveClerkSession();
  if (clerkSession) {
    return { session: clerkSession, source: 'clerk', jwtPayload: null };
  }

  if (!isLegacyAuthPathEnabled()) {
    return { session: null, source: null, jwtPayload: null };
  }

  const legacy = await getSessionContext(request);
  return {
    session: legacy.session,
    source: legacy.session ? 'legacy' : null,
    jwtPayload: legacy.jwtPayload,
  };
}

export async function resolveAppSession(request?: Request): Promise<SessionPayload | null> {
  const { session } = await resolveAppSessionContext(request);
  return session;
}