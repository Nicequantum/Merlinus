import 'server-only';

import { auth } from '@clerk/nextjs/server';
import {
  buildSessionPayloadFromTechnician,
  getSessionContext,
  type SessionPayload,
} from '@/lib/auth';
import { isClerkAuthPathEnabled, isLegacyAuthPathEnabled } from '@/lib/authMode';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isTechnicianAccountActive } from '@/lib/technicianAccounts';

export type AuthSource = 'clerk' | 'legacy';

export interface AppSessionContext {
  session: SessionPayload | null;
  /** How the session was authenticated — null when unauthenticated. */
  source: AuthSource | null;
  /** Legacy JWT claims for cookie refresh; null for Clerk sessions. */
  jwtPayload: SessionPayload | null;
}

async function resolveClerkLinkedSession(clerkUserId: string): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { clerkUserId },
    include: { dealership: true },
  });

  if (!tech || !isTechnicianAccountActive(tech)) return null;
  if (tech.role === 'service_advisor' && !tech.serviceAdvisorId) return null;

  return buildSessionPayloadFromTechnician(tech);
}

async function tryResolveClerkSession(): Promise<SessionPayload | null> {
  if (!isClerkAuthPathEnabled()) return null;

  try {
    const { userId } = await auth();
    if (!userId) return null;
    return resolveClerkLinkedSession(userId);
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