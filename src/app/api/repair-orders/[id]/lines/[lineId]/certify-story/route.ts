import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { encryptOptionalSensitiveText } from '@/lib/encryption';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { canAccessRepairOrder } from '@/lib/repairOrderAccess';
import { dbToRepairOrder } from '@/lib/roMapper';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeForCDKWithMeta } from '@/lib/sanitizeForCDK';
import { PROMPT_VERSION } from '@/prompts/version';
import { logStoryTechnicianActivity } from '@/lib/storyTechnicianLog';
import { recordTechnicianCertifiedStory } from '@/lib/technicianCertifiedStory';
import { parseRequestBody, certifyStorySchema } from '@/lib/validation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { id, lineId } = await params;

  return withAuth(
    request,
    async (session) => {
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

      const ro = await canAccessRepairOrder(session, id, { repairLines: true });
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
      const certifiedAt = new Date();

      await prisma.repairLine.update({
        where: { id: lineId },
        data: { warrantyStoryEncrypted: encryptOptionalSensitiveText(warrantyStory) },
      });

      await writeAuditLog({
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
        },
        ipAddress: getRequestIp(request),
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
      });

      return { warrantyStory, certifiedAt: certifiedAt.toISOString(), certifiedByName };
    },
    {
      rateLimitKey: 'story.certify',
      rateLimit: RATE_LIMITS.generate,
      blockInMaintenance: true,
      perfEvent: 'route.story.certify',
    }
  );
}