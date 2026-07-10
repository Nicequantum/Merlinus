import { getOwnerNationalSummary } from '@/lib/apex/ownerNationalSummary';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { rlsContextFromSession } from '@/lib/apex/rlsContext';
import { auditDealerIdFromSession } from '@/lib/audit';
import { writeAuditedAccess } from '@/lib/auditedAccess';
import { withAuth } from '@/lib/apiRoute';
import { isApexPlatformMode } from '@/lib/platformMode';
import { apiError } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';

export async function GET(request: Request) {
  if (!isApexPlatformMode()) {
    return apiError('Owner summary is only available in apex platform mode.', 404);
  }

  return withAuth(
    request,
    async (session) => {
      const summary = await getOwnerNationalSummary({
        technicianId: session.technicianId,
        scopeMode: session.scopeMode,
        activeDealerGroupId: session.activeDealerGroupId,
        dealerGroupName: session.dealerGroupName,
      });

      // Phase 6.1 — fail-closed owner console access audit
      await writeAuditedAccess(
        {
          action: 'owner.national_access',
          dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
          dealerId: auditDealerIdFromSession(session),
          technicianId: session.technicianId,
          entityType: 'owner_console',
          entityId: session.technicianId,
          ipAddress: getRequestIp(request),
          authSource: 'legacy',
          scopeMode: summary.scopeMode === 'group' ? 'national' : 'national',
          metadata: {
            consoleScope: summary.scopeMode ?? 'national',
            dealerGroupId: summary.dealerGroupId ?? null,
            dealerCount: summary.dealerCount,
            dealershipCount: summary.dealershipCount,
            activeUsers: summary.activeUsers,
            repairOrders7d: summary.repairOrders7d,
            certifiedStories7d: summary.certifiedStories7d,
            adoptionRatePct: summary.adoptionRatePct,
            attentionFlagCount: summary.attentionFlagCount,
            rooftopCount: summary.rooftops?.length ?? 0,
          },
        },
        { rls: { ...rlsContextFromSession(session), enforced: true } }
      );

      return summary;
    },
    { requireOwner: true, requireOwnerNational: true, rateLimitKey: 'owner.summary' }
  );
}
