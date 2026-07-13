import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { rlsContextFromSession, rlsTransaction } from '@/lib/apex/rlsContext';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { generateWarrantyStory } from '@/lib/grok';
import { buildStoryGenerateAuditMetadata } from '@/lib/promptFingerprint';
import { encryptOptionalSensitiveText } from '@/lib/encryption';
import { scopedRepairLineWhereForSession } from '@/lib/repairOrderAccess';
import { apiError, NOT_FOUND_ERROR, reportMappedRouteError } from '@/lib/errors';
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
import { withStoryAiRoute } from '@/lib/storyAiRoute';

// M4/M5 — customer-pay guard enforced in withStoryAiRoute (isCustomerPayRepairLine).
void isCustomerPayRepairLine;

/** Must match STORY_GENERATE_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  // Phase 7.3 H14 — shared shell (blockServiceAdvisorAi + load + customer-pay guard)
  return withStoryAiRoute(
    request,
    params,
    {
      rateLimitKey: 'story.generate',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      perfEvent: 'route.story.generate',
      customerPayMessage:
        'This line uses a Customer Pay template. Clear Customer Pay mode (Switch to warranty AI) to generate with Grok.',
    },
    async ({ request: req, session, repairOrderId: id, lineId, mapped, line, storyBrand, storyPack }) => {
      const pipelineAudit = auditStoryGenerationPipeline(mapped, line, { brand: storyBrand });
      logPerformance('story.generate.pipeline', 0, { ...pipelineAudit });

      let warrantyStory: string;
      let cdkSanitized = false;
      try {
        const grokStartedAt = Date.now();
        const rawStory = await generateWarrantyStory(mapped, line, { pack: storyPack });
        logPerformance('grok.story.generate.route', Date.now() - grokStartedAt, {
          model: pipelineAudit.model,
          promptChars: pipelineAudit.totalPromptChars,
          storyBrand,
        });
        const cleaned = sanitizeForCDKWithMeta(rawStory);
        warrantyStory = cleaned.text;
        cdkSanitized = cleaned.wasModified;
      } catch (error) {
        const mappedErr = mapGrokRouteError(error, 'Story generation');
        return reportMappedRouteError(mappedErr, error, 'story.generate');
      }

      try {
        await rlsTransaction(
          async (tx) => {
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
                  storyBrand,
                  packVersion: storyPack.packVersion,
                }),
                ipAddress: getRequestIp(req),
              },
              {
                where: scopedRepairLineWhereForSession(lineId, id, session),
                data: {
                  warrantyStoryEncrypted: encryptOptionalSensitiveText(warrantyStory),
                  storyQualityAuditEncrypted: '',
                  ...CLEAR_STORY_CERTIFICATION_DB,
                  ...dealerIdWriteFields(resolveDealerIdForWrite({ session })),
                },
              }
            );
          },
          { ...rlsContextFromSession(session), enforced: true }
        );
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
    }
  );
}
