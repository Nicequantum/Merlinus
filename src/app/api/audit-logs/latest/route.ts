import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { canAccessRepairOrder } from '@/lib/repairOrderAccess';
import { auditLatestQuerySchema, parseQueryParams } from '@/lib/validation';

const WARRANTY_STORY_ACTIONS = [
  'story.generate',
  'story.score',
  'story.review',
  'story.edit',
  'story.certify',
] as const;
const CUSTOMER_PAY_STORY_ACTIONS = [
  'customerPayTemplateApplied',
  'customerPayStory.edit',
  'customerPayStory.pdf_export',
] as const;

export async function GET(request: Request) {
  const query = parseQueryParams(request, auditLatestQuerySchema);
  if ('error' in query) return query.error;

  return withAuth(
    request,
    async (session) => {
      const { repairLineId } = query.data;

      const line = await prisma.repairLine.findFirst({
        where: {
          id: repairLineId,
          repairOrder: { dealershipId: session.dealershipId },
        },
        select: { id: true, isCustomerPay: true, repairOrderId: true },
      });

      if (!line) {
        return { hash: null, promptVersion: null };
      }

      const ro = await canAccessRepairOrder(session, line.repairOrderId, {});
      if (!ro) {
        return { hash: null, promptVersion: null };
      }

      const actions = line.isCustomerPay
        ? [...CUSTOMER_PAY_STORY_ACTIONS]
        : [...WARRANTY_STORY_ACTIONS];

      const latestLog = await prisma.auditLog.findFirst({
        where: {
          dealershipId: session.dealershipId,
          entityType: 'repairLine',
          entityId: repairLineId,
          action: { in: actions },
          entryHash: { not: '' },
        },
        orderBy: { createdAt: 'desc' },
        select: { entryHash: true, promptVersion: true },
      });

      return {
        hash: latestLog?.entryHash ?? null,
        promptVersion: latestLog?.promptVersion ?? null,
      };
    },
    { rateLimitKey: 'audit-logs.latest' }
  );
}