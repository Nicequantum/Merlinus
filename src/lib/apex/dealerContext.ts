/**
 * APEX NATIONAL PLATFORM — dealer tenancy context (Phase 1).
 *
 * MERLINUS SINGLE-DEALER: when dealerId is absent, all existing dealershipId-scoped
 * queries continue to behave exactly as before.
 */

export const MERLINUS_DEFAULT_DEALER_ID = 'merlinus-default-dealer';
export const MERLINUS_DEFAULT_DEALER_CODE = 'merlinus-tiverton';
export const APEX_DEALER_HEADER = 'x-apex-dealer-id';

export type DealerContextSource = 'session' | 'header' | 'env_default' | 'legacy_default' | 'none';

export interface DealerContext {
  dealerId: string | null;
  dealershipId: string | null;
  source: DealerContextSource;
}

export interface DealerAwareSession {
  dealershipId: string;
  dealerId?: string | null;
}

/** Read optional Apex dealer hint propagated by middleware or upstream proxies. */
export function getDealerIdFromRequest(request?: Request): string | null {
  const hinted = request?.headers.get(APEX_DEALER_HEADER)?.trim();
  return hinted || null;
}

/** MERLINUS SINGLE-DEALER fallback when multi-tenant hints are not configured. */
export function getLegacyDefaultDealerId(): string {
  return process.env.APEX_DEFAULT_DEALER_ID?.trim() || MERLINUS_DEFAULT_DEALER_ID;
}

/**
 * Resolve the active dealer for the current request/session.
 * Prefers explicit session/header hints; falls back to legacy single-dealer default.
 */
export function resolveDealerContext(input: {
  session?: DealerAwareSession | null;
  request?: Request;
}): DealerContext {
  const dealershipId = input.session?.dealershipId ?? null;
  const headerDealerId = getDealerIdFromRequest(input.request);
  if (headerDealerId) {
    return { dealerId: headerDealerId, dealershipId, source: 'header' };
  }

  const sessionDealerId = input.session?.dealerId?.trim();
  if (sessionDealerId) {
    return { dealerId: sessionDealerId, dealershipId, source: 'session' };
  }

  const envDefault = process.env.APEX_DEFAULT_DEALER_ID?.trim();
  if (envDefault) {
    return { dealerId: envDefault, dealershipId, source: 'env_default' };
  }

  // MERLINUS SINGLE-DEALER — preserve backward compatibility without requiring dealerId on every query.
  return {
    dealerId: getLegacyDefaultDealerId(),
    dealershipId,
    source: 'legacy_default',
  };
}

/** Pick dealerId for writes — prefers explicit session value, else resolved context. */
export function resolveDealerIdForWrite(input: {
  session?: DealerAwareSession | null;
  request?: Request;
}): string | null {
  const explicit = input.session?.dealerId?.trim();
  if (explicit) return explicit;
  return resolveDealerContext(input).dealerId;
}