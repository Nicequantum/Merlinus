import { withAuth } from '@/lib/apiRoute';
import { encryptJsonObject } from '@/lib/encryption';
import { prisma } from '@/lib/db';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { scoreWarrantyStory } from '@/lib/grok';
import { broadcastCompanionEvent } from '@/lib/companionBroadcast';
import { isStoryQualityParseFailure } from '@/prompts/storyQuality';
import type { StoryQualityResult } from '@/types';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { loadStoryRouteRepairOrder, scopedRepairLineWhere } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { mapGrokRouteError } from '@/lib/grokErrors';
import { PROMPT_VERSION } from '@/prompts/version';
import { hashWarrantyStory } from '@/lib/storyHash';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
import { persistRepairLineStoryInTransaction } from '@/lib/storyAiPersist';
import { parseRequestBody, parseRouteParams, repairOrderLineParamsSchema, reviewStorySchema } from '@/lib/validation';

/** Must match STORY_SCORE_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 100;

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
        return apiError('Warranty story text is required for scoring.', 400);
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
        return apiError('Customer Pay stories do not require AI quality scoring.', 400);
      }

      let quality: StoryQualityResult;
      try {
        const scored = await scoreWarrantyStory(mapped, line, warrantyStory);
        quality = { ...scored, scoredAgainstStory: warrantyStory };
        if (isStoryQualityParseFailure(quality)) {
          logger.error('story.score.parse_failed', {
            repairOrderId: id,
            lineId,
            technicianId: session.technicianId,
            summary: quality.summary,
          });
          return apiError(
            `Story audit could not read the AI score. ${quality.summary} Tap Audit Story to try again.`,
            502
          );
        }
      } catch (error) {
        const mappedError = mapGrokRouteError(error, 'Story scoring');
        const message =
          error instanceof Error && error.message.includes('unreadable JSON')
            ? 'Story audit could not read the AI score. AI quality score returned unreadable JSON.'
            : mappedError.message;
        const status =
          error instanceof Error && error.message.includes('unreadable JSON') ? 502 : mappedError.status;
        return apiError(message, status);
      }

      const storyHash = hashWarrantyStory(warrantyStory);

      try {
        await prisma.$transaction(async (tx) => {
          await persistRepairLineStoryInTransaction(
            tx,
            {
              action: 'story.score',
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
                storyHash,
              },
              ipAddress: getRequestIp(request),
            },
            {
              where: scopedRepairLineWhere(lineId, id, session.dealershipId),
              data: { storyQualityAuditEncrypted: encryptJsonObject(quality) },
            }
          );
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'Repair line not found for story persist') {
          return apiError(NOT_FOUND_ERROR, 404);
        }
        throw error;
      }

      void logStoryTechnicianActivity({
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        event: 'story.score',
        message: `Scored warranty story for RO ${mapped.roNumber}, line ${line.lineNumber}`,
        repairOrderId: id,
        repairLineId: lineId,
        roNumber: mapped.roNumber,
        lineNumber: line.lineNumber,
        metadata: {
          qualityScore: quality.score,
          qualityGrade: quality.grade,
          storyHash,
          promptVersion: PROMPT_VERSION,
        },
      });

      void broadcastCompanionEvent(session.technicianId, {
        type: 'story.quality',
        repairOrderId: id,
        lineId,
        quality,
      });
      void broadcastCompanionEvent(session.technicianId, {
        type: 'activity',
        label: `MI audit score: ${quality.score}/100`,
        repairOrderId: id,
        lineId,
      });

      return { quality };
    },
    {
      rateLimitKey: 'story.score',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      perfEvent: 'route.story.score',
    }
  );
}