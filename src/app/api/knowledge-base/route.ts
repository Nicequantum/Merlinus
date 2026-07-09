import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { knowledgeBaseForDealershipWhere } from '@/lib/saveTemplateFromStory';
import { mapKnowledgeBase, seedTemplateLibraryIfEmpty } from '@/lib/templateLibrary';
import { knowledgeBaseListQuerySchema, parseQueryParams } from '@/lib/validation';

export async function GET(request: Request) {
  const query = parseQueryParams(request, knowledgeBaseListQuerySchema);
  if ('error' in query) return query.error;

  return withAuth(
    request,
    async (session) => {
      await seedTemplateLibraryIfEmpty();

      const { category } = query.data;

      const entries = await prisma.knowledgeBase.findMany({
        where: {
          ...knowledgeBaseForDealershipWhere(session.dealershipId, session.dealerId),
          ...(category ? { category } : {}),
        },
        orderBy: [{ source: 'desc' }, { updatedAt: 'desc' }, { title: 'asc' }],
      });

      return { entries: entries.map(mapKnowledgeBase) };
    },
    { rateLimitKey: 'knowledge.list' }
  );
}