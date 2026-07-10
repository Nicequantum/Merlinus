import { listEnterableDealershipsForOwner } from '@/lib/apex/dealerGroupAccess';
import { withAuth } from '@/lib/apiRoute';
import { isApexPlatformMode } from '@/lib/platformMode';
import { apiError } from '@/lib/errors';

export async function GET(request: Request) {
  if (!isApexPlatformMode()) {
    return apiError('Owner dealerships are only available in apex platform mode.', 404);
  }

  return withAuth(
    request,
    async (session) => {
      // Group owners: only rooftops under their DealerGroup memberships.
      // Platform national owners (no memberships): all non-sentinel rooftops.
      const dealerships = await listEnterableDealershipsForOwner(session.technicianId);

      return {
        dealerships: dealerships.map((dealership) => ({
          id: dealership.id,
          name: dealership.name,
          dealerCode: dealership.dealerCode,
          isPrimary: false,
          dealerGroupId: dealership.dealerGroupId,
        })),
        scopeMode: session.scopeMode ?? 'national',
        activeDealerGroupId: session.activeDealerGroupId ?? null,
        dealerGroupName: session.dealerGroupName ?? null,
      };
    },
    {
      requireOwner: true,
      requireOwnerNational: true,
      rateLimitKey: 'owner.dealerships',
    }
  );
}
