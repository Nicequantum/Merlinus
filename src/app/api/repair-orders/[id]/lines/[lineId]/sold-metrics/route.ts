import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import {
  canAccessRepairOrder,
  isServiceAdvisorUser,
  scopedRepairLineWhere,
} from '@/lib/repairOrderAccess';
import { mapSoldMetricsFromDb, soldMetricsToDbUpdateFields } from '@/lib/repairLineSoldMetrics';
import { parseRequestBody, parseRouteParams, repairOrderLineParamsSchema, soldMetricsSchema } from '@/lib/validation';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const routeParams = await parseRouteParams(repairOrderLineParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id, lineId } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      if (!isServiceAdvisorUser(session)) {
        return apiError(FORBIDDEN_ERROR, 403);
      }

      const parsed = await parseRequestBody(request, soldMetricsSchema);
      if ('error' in parsed) return parsed.error;

      const ro = await canAccessRepairOrder(session, id, { repairLines: true });
      if (!ro) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const line = ro.repairLines.find((item) => item.id === lineId);
      if (!line) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const lineUpdated = await prisma.repairLine.updateMany({
        where: scopedRepairLineWhere(lineId, id, session.dealershipId),
        data: soldMetricsToDbUpdateFields(parsed.data),
      });
      if (lineUpdated.count === 0) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const updated = await prisma.repairLine.findFirst({
        where: scopedRepairLineWhere(lineId, id, session.dealershipId),
        select: {
          id: true,
          lineNumber: true,
          soldLaborHours: true,
          soldLaborAmount: true,
          soldPartsAmount: true,
          customerApproved: true,
          isAddOn: true,
          soldMetricsUpdatedAt: true,
        },
      });
      if (!updated) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      await writeAuditLog({
        action: 'advisor.sold_metrics',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'repair_line',
        entityId: updated.id,
        metadata: {
          repairOrderId: id,
          lineNumber: updated.lineNumber,
          serviceAdvisorId: session.serviceAdvisorId,
        },
        ipAddress: getRequestIp(request),
      });

      return {
        lineId: updated.id,
        soldMetrics: mapSoldMetricsFromDb(updated),
      };
    },
    { rateLimitKey: 'ros.sold-metrics' }
  );
}