import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { templatesForDealershipWhere } from '@/lib/saveTemplateFromStory';
import { mapTemplate, seedTemplateLibraryIfEmpty } from '@/lib/templateLibrary';
import { parseQueryParams, templateListQuerySchema } from '@/lib/validation';

export async function GET(request: Request) {
  const query = parseQueryParams(request, templateListQuerySchema);
  if ('error' in query) return query.error;

  return withAuth(
    request,
    async (session) => {
      await seedTemplateLibraryIfEmpty();

      const { category } = query.data;

      const templates = await prisma.template.findMany({
        where: {
          ...templatesForDealershipWhere(session.dealershipId, session.dealerId),
          ...(category ? { category } : {}),
        },
        orderBy: [{ source: 'desc' }, { updatedAt: 'desc' }, { title: 'asc' }],
      });

      return { templates: templates.map(mapTemplate) };
    },
    { rateLimitKey: 'templates.list' }
  );
}