import { withAuth } from '@/lib/apiRoute';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { GLOBAL_DEALERSHIP_ID, recordTemplateUsage } from '@/lib/templateLibrary';
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
        where: {
          id,
          OR: [{ dealershipId: session.dealershipId }, { dealershipId: GLOBAL_DEALERSHIP_ID }],
        },
      });

      if (!template) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      await recordTemplateUsage(id, session.dealershipId);
      return { ok: true };
    },
    { rateLimitKey: 'templates.use' }
  );
}