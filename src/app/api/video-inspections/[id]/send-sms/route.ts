import { auditDealerIdFromSession } from '@/lib/audit';
import { writeAuditedAccess } from '@/lib/auditedAccess';
import { getRlsDb } from '@/lib/apex/rlsContext';
import { withAuth } from '@/lib/apiRoute';
import { encryptSensitiveText } from '@/lib/encryption';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { isSmsEnabled, normalizeE164, sendSms } from '@/lib/sms/twilio';
import { findInspectionForSession } from '@/lib/videoInspection/access';
import {
  buildCustomerViewerUrl,
  generateShareToken,
  hashShareToken,
} from '@/lib/videoInspection/shareTokens';
import { AUTH_JSON_BODY_LIMIT_BYTES, parseRequestBody, parseRouteParams } from '@/lib/validation';
import { z } from 'zod';

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });
const bodySchema = z.object({
  phone: z.string().trim().min(7).max(32),
  /** Optional existing share URL (must be full /v/ token URL). If omitted, creates a new share. */
  shareUrl: z.string().url().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const routeParams = await parseRouteParams(paramsSchema, params);
  if ('error' in routeParams) return routeParams.error;

  return withAuth(
    request,
    async (session) => {
      if (!isSmsEnabled()) {
        return apiError(
          'SMS is not configured. Copy the customer link instead, or set SMS_ENABLED and Twilio credentials.',
          503
        );
      }

      const existing = await findInspectionForSession(session, routeParams.data.id);
      if (!existing) return apiError(NOT_FOUND_ERROR, 404);

      const parsed = await parseRequestBody(request, bodySchema, AUTH_JSON_BODY_LIMIT_BYTES);
      if ('error' in parsed) return parsed.error;

      const phone = normalizeE164(parsed.data.phone);
      if (!phone) return apiError('Enter a valid mobile number (US 10-digit or E.164).', 400);

      let shareUrl = parsed.data.shareUrl;
      let shareId: string | null = null;

      if (!shareUrl) {
        const token = generateShareToken();
        const share = await getRlsDb().videoInspectionShare.create({
          data: {
            videoInspectionId: existing.id,
            tokenHash: hashShareToken(token),
            expiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
            createdByTechnicianId: session.technicianId,
          },
        });
        shareId = share.id;
        shareUrl = buildCustomerViewerUrl(token);
      }

      const dealership = existing.dealership?.name || session.dealershipName || 'Your service team';
      const body = `${dealership}: Your vehicle video inspection is ready. Watch & read your report: ${shareUrl}`;

      try {
        const { sid } = await sendSms(phone, body);
        await getRlsDb().videoInspectionSmsLog.create({
          data: {
            videoInspectionId: existing.id,
            shareId,
            phoneEncrypted: encryptSensitiveText(phone),
            phoneLast4: phone.slice(-4),
            providerMessageId: sid,
            status: 'sent',
            sentByTechnicianId: session.technicianId,
          },
        });
        await getRlsDb().videoInspection.update({
          where: { id: existing.id },
          data: { status: existing.status === 'ready' ? 'sent' : existing.status },
        });

        await writeAuditedAccess({
          action: 'video.sms_send',
          dealershipId: session.dealershipId,
          dealerId: auditDealerIdFromSession(session),
          technicianId: session.technicianId,
          entityType: 'video_inspection',
          entityId: existing.id,
          metadata: { phoneLast4: phone.slice(-4), providerMessageId: sid },
          ipAddress: getRequestIp(request),
        });

        return { ok: true, shareUrl, phoneLast4: phone.slice(-4) };
      } catch (error) {
        return apiError(error instanceof Error ? error.message : 'SMS send failed', 502);
      }
    },
    {
      rateLimitKey: 'video.sms',
      rateLimit: RATE_LIMITS.sms,
      requireDealershipContext: true,
    }
  );
}
