import { withAuth } from '@/lib/apiRoute';
import { clearCustomerPayMode } from '@/lib/customerPayTemplate';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { canAccessRepairOrder } from '@/lib/repairOrderAccess';
import { getRequestIp } from '@/lib/rate-limit';

/** M1: Dedicated endpoint to clear Customer Pay mode and re-enable warranty AI flows. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { id, lineId } = await params;

  return withAuth(
    request,
    async (session) => {
      const ro = await canAccessRepairOrder(session, id, { repairLines: true });
      if (!ro) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const line = ro.repairLines.find((l) => l.id === lineId);
      if (!line) return apiError(NOT_FOUND_ERROR, 404);

      await clearCustomerPayMode({
        repairOrderId: id,
        repairLineId: lineId,
        dealershipId: session.dealershipId,
      });

      return { ok: true, isCustomerPay: false };
    },
    { rateLimitKey: 'ros.update' }
  );
}