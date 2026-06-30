import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { encryptJsonObject } from '@/lib/encryption';
import { prisma } from '@/lib/db';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { reviewWarrantyStory } from '@/lib/grok';
import { PROMPT_VERSION } from '@/prompts/version';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { loadStoryRouteRepairOrder, scopedRepairLineWhere } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { mapGrokRouteError } from '@/lib/grokErrors';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
import { parseRequestBody, parseRouteParams, repairOrderLineParamsSchema, reviewStorySchema } from '@/lib/validation';

/** Must match STORY_REVIEW_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const routeParams = await parseRouteParams(repairOrderLineParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id, lineId } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      if (session.role === 'service_advisor') {
        return apiError(FORBIDDEN_ERROR, 403);
      }

      const parsed = await parseRequestBody(request, reviewStorySchema);
      if ('error' in parsed) return parsed.error;

      const warrantyStory = parsed.data.warrantyStory.trim();
      if (!warrantyStory) {
        return apiError('Warranty story text is required for review.', 400);
      }

      const ro = await loadStoryRouteRepairOrder(session, id);
      if (!ro) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const mapped = dbToRepairOrder(ro);
      const line = mapped.repairLines.find((l) => l.id === lineId);
      if (!line) return apiError(NOT_FOUND_ERROR, 404);

      const dbLine = ro.repairLines.find((l) => l.id === lineId);
      if (isCustomerPayRepairLine(dbLine)) {
        return apiError(
          'Customer Pay stories do not require AI quality review. Edit the text directly if needed.',
          400
        );
      }

      let review;
      try {
        review = await reviewWarrantyStory(mapped, line, warrantyStory);
      } catch (error) {
        const mapped = mapGrokRouteError(error, 'Story review');
        return apiError(mapped.message, mapped.status);
      }

      const quality = { ...review, scoredAgainstStory: warrantyStory };

      await writeAuditLog({
        action: 'story.review',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'repairLine',
        entityId: lineId,
        promptVersion: PROMPT_VERSION,
        metadata: {
          repairOrderId: id,
          lineNumber: line.lineNumber,
          promptVersion: PROMPT_VERSION,
          qualityScore: quality.score,
          qualityGrade: quality.grade,
        },
        ipAddress: getRequestIp(request),
      });

      const lineUpdated = await prisma.repairLine.updateMany({
        where: scopedRepairLineWhere(lineId, id, session.dealershipId),
        data: { storyQualityAuditEncrypted: encryptJsonObject(quality) },
      });
      if (lineUpdated.count === 0) return apiError(NOT_FOUND_ERROR, 404);

      void logStoryTechnicianActivity({
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        event: 'story.review',
        message: `Reviewed warranty story for RO ${mapped.roNumber}, line ${line.lineNumber}`,
        repairOrderId: id,
        repairLineId: lineId,
        roNumber: mapped.roNumber,
        lineNumber: line.lineNumber,
        metadata: {
          qualityScore: quality.score,
          qualityGrade: quality.grade,
          promptVersion: PROMPT_VERSION,
        },
      });

      return { review: quality };
    },
    {
      rateLimitKey: 'story.review',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      perfEvent: 'route.story.review',
    }
  );
}