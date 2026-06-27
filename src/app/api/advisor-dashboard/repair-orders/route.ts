import {
  mapAdvisorRepairOrderSummary,
} from '@/lib/advisorDashboardMappers';
import {
  isServiceAdvisorUser,
  requireServiceAdvisorLink,
} from '@/lib/advisorDashboardAccess';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { apiError, FORBIDDEN_ERROR } from '@/lib/errors';
import { getStartOfDealershipDay } from '@/lib/dealershipDayBoundary';

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      if (!isServiceAdvisorUser(session)) {
        return apiError(FORBIDDEN_ERROR, 403);
      }

      const linkedAdvisorId = requireServiceAdvisorLink(session);
      if (!linkedAdvisorId) {
        return apiError('Service advisor profile is not linked to this account.', 403);
      }

      const startOfToday = getStartOfDealershipDay();
      const repairOrders = await prisma.repairOrder.findMany({
        where: {
          dealershipId: session.dealershipId,
          serviceAdvisorId: linkedAdvisorId,
          updatedAt: { gte: startOfToday },
        },
        include: {
          repairLines: {
            orderBy: { lineNumber: 'asc' },
            select: {
              id: true,
              lineNumber: true,
              description: true,
              descriptionEncrypted: true,
              soldLaborHours: true,
              soldLaborAmount: true,
              soldPartsAmount: true,
              customerApproved: true,
              isAddOn: true,
              soldMetricsUpdatedAt: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });

      return {
        repairOrders: repairOrders.map(mapAdvisorRepairOrderSummary),
      };
    },
    { rateLimitKey: 'advisor-dashboard.ros.list' }
  );
}