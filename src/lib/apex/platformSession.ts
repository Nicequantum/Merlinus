import 'server-only';

import { getSessionContext, type SessionPayload } from '@/lib/auth';
import { getApexSessionContext, type ApexAccessClaims } from '@/lib/apex/apexSession';
import { isApexPlatformMode } from '@/lib/platformMode';

/**
 * Platform-aware JWT session resolution.
 * MERLINUS: benz_tech_session (8h legacy JWT).
 * APEX: apex_access short-lived JWT (+ apex_refresh for renewal).
 */
export async function resolvePlatformSessionContext(request?: Request): Promise<{
  session: SessionPayload | null;
  jwtPayload: SessionPayload | ApexAccessClaims | null;
}> {
  if (isApexPlatformMode()) {
    return getApexSessionContext(request);
  }
  return getSessionContext(request);
}