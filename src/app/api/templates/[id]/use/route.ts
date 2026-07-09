import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { templateAccessWhere } from '@/lib/saveTemplateFromStory';
import { recordTemplateUsage } from '@/lib/templateLibrary';
import { prisma } from '@/lib/db';
import { parseRouteParams, routeIdParamsSchema } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await parseRouteParams(routeIdParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      const template = await prisma.template.findFirst({
        where: templateAccessWhere(session.dealershipId, id, session.dealerId),
      });

      if (!template) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      await recordTemplateUsage(id, session.dealershipId);

      await writeAuditLog({
        action: 'template.use',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'template',
        entityId: id,
        metadata: { title: template.title, category: template.category },
        ipAddress: getRequestIp(request),
      });

      return { ok: true };
    },
    { rateLimitKey: 'templates.use' }
  );
}