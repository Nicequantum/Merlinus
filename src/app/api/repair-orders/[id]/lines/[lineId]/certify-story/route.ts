import { appendAuditLogInTransaction } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { encryptOptionalSensitiveText } from '@/lib/encryption';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR } from '@/lib/errors';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { loadStoryRouteRepairOrder, scopedRepairLineWhere } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeForCDKWithMeta } from '@/lib/sanitizeForCDK';
import { buildStoryCertificationDbFields } from '@/lib/storyCertification';
import { hashWarrantyStory } from '@/lib/storyHash';
import { PROMPT_VERSION } from '@/prompts/version';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
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

      const hasGenerateAudit = await prisma.auditLog.findFirst({
        where: {
          dealershipId: session.dealershipId,
          entityType: 'repairLine',
          entityId: lineId,
          action: 'story.generate',
        },
        select: { id: true },
      });
      if (!hasGenerateAudit) {
        return apiError('Only AI-generated warranty stories require technician certification.', 400);
      }

      const { text: warrantyStory } = sanitizeForCDKWithMeta(rawStory);
      const storyHash = hashWarrantyStory(warrantyStory);
      const certifiedAt = new Date();

      const auditLogId = await prisma.$transaction(async (tx) => {
        const newAuditLogId = await appendAuditLogInTransaction(tx, {
          action: 'story.certify',
          dealershipId: session.dealershipId,
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
          where: scopedRepairLineWhere(lineId, id, session.dealershipId),
          data: {
            warrantyStoryEncrypted: encryptOptionalSensitiveText(warrantyStory),
            ...buildStoryCertificationDbFields({
              certifiedAt,
              certifiedByTechnicianId: session.technicianId,
              certifiedByName,
              storyHash,
            }),
          },
        });
        if (lineUpdated.count === 0) {
          throw new Error('Repair line not found for certification');
        }

        return newAuditLogId;
      });

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
          storyHash,
        },
      });

      await recordTechnicianCertifiedStory({
        dealershipId: session.dealershipId,
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

      return { warrantyStory, certifiedAt: certifiedAt.toISOString(), certifiedByName, storyHash };
    },
    {
      rateLimitKey: 'story.certify',
      rateLimit: RATE_LIMITS.generate,
      blockInMaintenance: true,
      perfEvent: 'route.story.certify',
    }
  );
}