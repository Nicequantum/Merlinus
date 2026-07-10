import type { AuditScopeMode } from '@/lib/apex/platformConstants';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { scopedDealershipWhere } from '@/lib/apex/dealerScope';
import { isApexPlatformMode } from '@/lib/platformMode';
import type { SessionPayload } from '@/lib/auth';

/** Thrown when an owner in national scope attempts dealership PII access. */
export class DealershipScopeRequiredError extends Error {
  readonly code = 'DEALERSHIP_CONTEXT_REQUIRED';

  constructor(message = 'Dealership context required') {
    super(message);
    this.name = 'DealershipScopeRequiredError';
  }
}

export type TenantScopedSession = Pick<
  SessionPayload,
  'role' | 'dealershipId' | 'dealerId' | 'scopeMode' | 'isOwner' | 'activeDealershipId'
>;

export function isOwnerRole(role: string): boolean {
  return role === 'owner';
}

/** MERLINUS: always dealership. APEX owners default to national until enter-dealership. */
export function resolveSessionScopeMode(session: TenantScopedSession): AuditScopeMode {
  if (!isApexPlatformMode()) return 'dealership';
  if (!isOwnerRole(session.role)) return 'dealership';
  return session.scopeMode ?? 'national';
}

export function enrichSessionWithTenantScope(session: SessionPayload): SessionPayload {
  const scopeMode = isApexPlatformMode()
    ? isOwnerRole(session.role)
      ? (session.scopeMode ?? 'national')
      : 'dealership'
    : 'dealership';
  const isOwner = isOwnerRole(session.role);
  const activeDealershipId =
    scopeMode === 'dealership' ? session.activeDealershipId ?? session.dealershipId : undefined;

  return {
    ...session,
    scopeMode,
    isOwner,
    activeDealershipId,
  };
}

/** True when session may access dealership-scoped customer PII and RO data. */
export function canAccessDealershipPii(session: TenantScopedSession): boolean {
  if (!isApexPlatformMode()) return true;
  if (!isOwnerRole(session.role)) return true;
  return resolveSessionScopeMode(session) === 'dealership';
}

/** Owner in national scope — allowed on /api/owner/* only. */
export function canAccessNationalConsole(session: TenantScopedSession): boolean {
  if (!isApexPlatformMode()) return false;
  return isOwnerRole(session.role) && resolveSessionScopeMode(session) === 'national';
}

/**
 * Resolve active rooftop + dealer for PII queries — throws when national owner lacks context.
 */
export function requireDealershipScope(session: TenantScopedSession): {
  dealershipId: string;
  dealerId: string | null;
} {
  if (!canAccessDealershipPii(session)) {
    throw new DealershipScopeRequiredError();
  }

  const dealershipId = session.activeDealershipId?.trim() || session.dealershipId;
  return {
    dealershipId,
    dealerId: session.dealerId?.trim() || null,
  };
}

/** Prisma where clause for PII tables — enforces dealership context for national owners. */
export function scopedPiiWhere(
  session: TenantScopedSession
): { dealershipId: string; dealerId?: string } {
  const scope = requireDealershipScope(session);
  return scopedDealershipWhere(scope.dealershipId, scope.dealerId);
}

export function isSentinelNationalDealership(dealershipId: string): boolean {
  return dealershipId === APEX_NATIONAL_DEALERSHIP_ID;
}