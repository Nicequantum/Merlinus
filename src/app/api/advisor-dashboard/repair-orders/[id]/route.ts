import { mapAdvisorRepairOrderDetail } from '@/lib/advisorDashboardMappers';
import {
  canAdvisorAccessRepairOrder,
  isServiceAdvisorUser,
} from '@/lib/advisorDashboardAccess';
import { withAuth } from '@/lib/apiRoute';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return withAuth(
    request,
    async (session) => {
      if (!isServiceAdvisorUser(session)) {
        return apiError(FORBIDDEN_ERROR, 403);
      }

      const ro = await canAdvisorAccessRepairOrder(session, id);
      if (!ro) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      return { repairOrder: mapAdvisorRepairOrderDetail(ro) };
    },
    { rateLimitKey: 'advisor-dashboard.ros.get' }
  );
}