import { getOwnerNationalSummary } from '@/lib/apex/ownerNationalSummary';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
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
      const summary = await getOwnerNationalSummary();

      await writeAuditLog({
        action: 'owner.national_access',
        dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'owner_console',
        entityId: session.technicianId,
        ipAddress: getRequestIp(request),
        authSource: 'legacy',
        scopeMode: 'national',
        metadata: {
          dealerCount: summary.dealerCount,
          dealershipCount: summary.dealershipCount,
          activeUsers: summary.activeUsers,
          repairOrdersLast7Days: summary.repairOrdersLast7Days,
        },
      });

      return summary;
    },
    { requireOwner: true, rateLimitKey: 'owner.summary' }
  );
}