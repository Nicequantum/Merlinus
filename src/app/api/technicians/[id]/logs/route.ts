import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { parseQueryParams, parseRouteParams, routeIdParamsSchema, technicianLogQuerySchema } from '@/lib/validation';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await parseRouteParams(routeIdParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id } = routeParams.data;

  const query = parseQueryParams(request, technicianLogQuerySchema);
  if ('error' in query) return query.error;
  const { category, limit } = query.data;

  return withAuth(
    request,
    async (session) => {
      const technician = await prisma.technician.findFirst({
        where: { id, dealershipId: session.dealershipId, deletedAt: null },
        select: { id: true },
      });

      if (!technician) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const logs = await prisma.technicianActivityLog.findMany({
        where: {
          technicianId: id,
          dealershipId: session.dealershipId,
          ...(category ? { category } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          category: true,
          event: true,
          message: true,
          repairOrderId: true,
          repairLineId: true,
          clientSessionId: true,
          metadata: true,
          createdAt: true,
        },
      });

      return {
        logs: logs.map((log) => ({
          id: log.id,
          category: log.category,
          event: log.event,
          message: log.message,
          repairOrderId: log.repairOrderId,
          repairLineId: log.repairLineId,
          clientSessionId: log.clientSessionId,
          metadata: safeParseMetadata(log.metadata),
          createdAt: log.createdAt.toISOString(),
        })),
      };
    },
    { rateLimitKey: 'technicians.logs', requireManager: true }
  );
}

function safeParseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}