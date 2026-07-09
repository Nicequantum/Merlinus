import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { appendAuditLogInTransaction, auditDealerIdFromSession } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { encryptOptionalSensitiveText } from '@/lib/encryption';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { loadStoryRouteRepairOrder, scopedRepairLineWhereForSession } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeForCDKWithMeta } from '@/lib/sanitizeForCDK';
import { buildStoryCertificationDbFields } from '@/lib/storyCertification';
import { logger } from '@/lib/logger';
import {
  lockRepairLineForCertification,
  StoryCertificationGateError,
  validateStoryCertificationPrerequisitesInTransaction,
} from '@/lib/storyCertificationGate';
import { hashWarrantyStory } from '@/lib/storyHash';
import { PROMPT_VERSION } from '@/prompts/version';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
import { broadcastCompanionEvent } from '@/lib/companionBroadcast';
import { recordTechnicianCertifiedStory } from '@/lib/technicianCertifiedStory';
import { certifyStorySchema, parseRequestBody, parseRouteParams, repairOrderLineParamsSchema } from '@/lib/validation';

function namesMatchForCertification(sessionName: string, certifiedByName: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return normalize(sessionName) === normalize(certifiedByName);
}

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

      const parsed = await parseRequestBody(request, certifyStorySchema);
      if ('error' in parsed) return parsed.error;

      const certifiedByName = parsed.data.certifiedByName.trim();
      const rawStory = parsed.data.warrantyStory.trim();
      if (!rawStory) {
        return apiError('Warranty story text is required for certification.', 400);
      }
      if (!certifiedByName) {
        return apiError('Technician full name is required for certification.', 400);
      }
      if (!namesMatchForCertification(session.name, certifiedByName)) {
        return apiError(
          'Certification name must match your signed-in technician profile name exactly.',
          400
        );
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
        return apiError('Customer Pay stories do not require technician certification.', 400);
      }

      const { text: warrantyStory } = sanitizeForCDKWithMeta(rawStory);
      const certifiedAt = new Date();

      let auditLogId: string;
      let storyHash: string;

      try {
        auditLogId = await prisma.$transaction(async (tx) => {
          const lockedLine = await lockRepairLineForCertification(tx, {
            repairLineId: lineId,
            dealershipId: session.dealershipId,
          });
          if (!lockedLine) {
            throw new Error('Repair line not found for certification');
          }

          const gate = await validateStoryCertificationPrerequisitesInTransaction(tx, {
            dealershipId: session.dealershipId,
            repairLineId: lineId,
            warrantyStory,
            lockedLine,
          });
          if (!gate.ok) {
            throw new StoryCertificationGateError(gate);
          }

          storyHash = gate.storyHash ?? hashWarrantyStory(warrantyStory);

          const newAuditLogId = await appendAuditLogInTransaction(tx, {
            action: 'story.certify',
            dealershipId: session.dealershipId,
            dealerId: auditDealerIdFromSession(session),
            technicianId: session.technicianId,
            entityType: 'repairLine',
            entityId: lineId,
            promptVersion: PROMPT_VERSION,
            metadata: {
              repairOrderId: id,
              lineNumber: line.lineNumber,
              certifiedByName,
              certifiedAt: certifiedAt.toISOString(),
              aiAssistedStoryCertified: true,
              promptVersion: PROMPT_VERSION,
              storyHash,
            },
            ipAddress: getRequestIp(request),
          });

          const lineUpdated = await tx.repairLine.updateMany({
            where: scopedRepairLineWhereForSession(lineId, id, session),
            data: {
              warrantyStoryEncrypted: encryptOptionalSensitiveText(warrantyStory),
              ...buildStoryCertificationDbFields({
                certifiedAt,
                certifiedByTechnicianId: session.technicianId,
                certifiedByName,
                storyHash,
              }),
              // APEX NATIONAL PLATFORM — stamp dealerId from authenticated session when present.
              ...dealerIdWriteFields(resolveDealerIdForWrite({ session })),
            },
          });
          if (lineUpdated.count === 0) {
            throw new Error('Repair line not found for certification');
          }

          return newAuditLogId;
        });
      } catch (error) {
        if (error instanceof StoryCertificationGateError) {
          logger.warn('story.certify.gate_rejected', {
            repairOrderId: id,
            lineId,
            technicianId: session.technicianId,
            reason: error.result.reason,
            storyHash: error.result.storyHash,
          });
          return apiError(error.result.message, 400);
        }
        if (error instanceof Error && error.message === 'Repair line not found for certification') {
          return apiError(NOT_FOUND_ERROR, 404);
        }
        throw error;
      }

      void logStoryTechnicianActivity({
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        event: 'story.certify',
        message: `Certified warranty story for RO ${mapped.roNumber}, line ${line.lineNumber}`,
        repairOrderId: id,
        repairLineId: lineId,
        roNumber: mapped.roNumber,
        lineNumber: line.lineNumber,
        metadata: {
          certifiedAt: certifiedAt.toISOString(),
          promptVersion: PROMPT_VERSION,
          storyHash: storyHash!,
        },
      });

      await recordTechnicianCertifiedStory({
        dealershipId: session.dealershipId,
        dealerId: dealerIdWriteFields(resolveDealerIdForWrite({ session })).dealerId,
        technicianId: session.technicianId,
        repairOrderId: id,
        repairLineId: lineId,
        roNumber: mapped.roNumber,
        lineNumber: line.lineNumber,
        certifiedAt,
        certifiedByName,
        promptVersion: PROMPT_VERSION,
        auditLogId: typeof auditLogId === 'string' ? auditLogId : undefined,
      });

      void broadcastCompanionEvent(session.technicianId, {
        type: 'story.certification',
        repairOrderId: id,
        lineId,
        certifiedByName,
        certifiedAt: certifiedAt.toISOString(),
        warrantyStory,
        storyHash: storyHash!,
      });
      void broadcastCompanionEvent(session.technicianId, {
        type: 'activity',
        label: 'Story certified',
        detail: certifiedByName,
        repairOrderId: id,
        lineId,
      });

      return {
        warrantyStory,
        certifiedAt: certifiedAt.toISOString(),
        certifiedByName,
        storyHash: storyHash!,
      };
    },
    {
      rateLimitKey: 'story.certify',
      rateLimit: RATE_LIMITS.generate,
      blockInMaintenance: true,
      perfEvent: 'route.story.certify',
    }
  );
}