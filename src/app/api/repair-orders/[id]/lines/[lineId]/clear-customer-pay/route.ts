import { withAuth } from '@/lib/apiRoute';
import { clearCustomerPayMode } from '@/lib/customerPayTemplate';
import { prisma } from '@/lib/db';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
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
      const ro = await prisma.repairOrder.findUnique({
        where: { id },
        include: { repairLines: true },
      });

      if (!ro || ro.dealershipId !== session.dealershipId) {
        return apiError(NOT_FOUND_ERROR, 404);
      }
      if (session.role !== 'manager' && ro.technicianId !== session.technicianId) {
        return apiError('You do not have permission to perform this action.', 403);
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