import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { generateWarrantyStory } from '@/lib/grok';
import { buildStoryGenerateAuditMetadata } from '@/lib/promptFingerprint';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { encryptOptionalSensitiveText } from '@/lib/encryption';
import { loadStoryRouteRepairOrder, scopedRepairLineWhereForSession } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { mapGrokRouteError } from '@/lib/grokErrors';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeForCDKWithMeta } from '@/lib/sanitizeForCDK';
import { logPerformance } from '@/lib/perf';
import { auditStoryGenerationPipeline } from '@/lib/storyGenerationPipeline';
import { broadcastCompanionEvent } from '@/lib/companionBroadcast';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
import { CLEAR_STORY_CERTIFICATION_DB } from '@/lib/storyCertification';
import { auditDealerIdFromSession } from '@/lib/audit';
import { persistRepairLineStoryInTransaction } from '@/lib/storyAiPersist';
import { parseRouteParams, repairOrderLineParamsSchema } from '@/lib/validation';

/** Must match STORY_GENERATE_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 60;

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
          'This line uses a Customer Pay template. Clear Customer Pay mode (Switch to warranty AI) to generate with Grok.',
          400
        );
      }

      const pipelineAudit = auditStoryGenerationPipeline(mapped, line);
      logPerformance('story.generate.pipeline', 0, { ...pipelineAudit });

      let warrantyStory: string;
      let cdkSanitized = false;
      try {
        const grokStartedAt = Date.now();
        const rawStory = await generateWarrantyStory(mapped, line);
        logPerformance('grok.story.generate.route', Date.now() - grokStartedAt, {
          model: pipelineAudit.model,
          promptChars: pipelineAudit.totalPromptChars,
        });
        const cleaned = sanitizeForCDKWithMeta(rawStory);
        warrantyStory = cleaned.text;
        cdkSanitized = cleaned.wasModified;
      } catch (error) {
        const mapped = mapGrokRouteError(error, 'Story generation');
        return apiError(mapped.message, mapped.status);
      }

      try {
        await prisma.$transaction(async (tx) => {
          await persistRepairLineStoryInTransaction(
            tx,
            {
              action: 'story.generate',
              dealershipId: session.dealershipId,
              dealerId: auditDealerIdFromSession(session),
              technicianId: session.technicianId,
              entityType: 'repairLine',
              entityId: lineId,
              metadata: buildStoryGenerateAuditMetadata({
                repairOrderId: id,
                lineNumber: line.lineNumber,
                advisorIntelligenceUsed: false,
                advisorContextHash: null,
                knowledgeBaseEntryIds: [],
                historyContextLineCount: 0,
                qualityScore: null,
                qualityGrade: null,
                serviceAdvisorId: null,
              }),
              ipAddress: getRequestIp(request),
            },
            {
              where: scopedRepairLineWhereForSession(lineId, id, session),
              data: {
                warrantyStoryEncrypted: encryptOptionalSensitiveText(warrantyStory),
                storyQualityAuditEncrypted: '',
                ...CLEAR_STORY_CERTIFICATION_DB,
                // APEX NATIONAL PLATFORM — stamp dealerId from authenticated session when present.
                ...dealerIdWriteFields(resolveDealerIdForWrite({ session })),
              },
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
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        event: 'story.generate',
        message: `Generated warranty story for RO ${mapped.roNumber}, line ${line.lineNumber}`,
        repairOrderId: id,
        repairLineId: lineId,
        roNumber: mapped.roNumber,
        lineNumber: line.lineNumber,
        metadata: {
          cdkSanitized,
          model: pipelineAudit.model,
          promptChars: pipelineAudit.totalPromptChars,
        },
      });

      void broadcastCompanionEvent(session.technicianId, {
        type: 'ro.patch',
        repairOrderId: id,
        lineId,
        linePatch: { warrantyStory },
      });
      void broadcastCompanionEvent(session.technicianId, {
        type: 'activity',
        label: 'Generated warranty story',
        repairOrderId: id,
        lineId,
      });

      return { warrantyStory, quality: null, cdkSanitized };
    },
    {
      rateLimitKey: 'story.generate',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      perfEvent: 'route.story.generate',
    }
  );
}