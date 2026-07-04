import { fetchPrivateBlobAsDataUrl } from '@/lib/blob';
import { withAuth } from '@/lib/apiRoute';
import { blockServiceAdvisorAi } from '@/lib/roleGuards';
import { extractDiagnosticsFromImage } from '@/lib/grok';
import { apiError, FORBIDDEN_ERROR, IMAGE_ACCESS_ERROR } from '@/lib/errors';
import { mapBlobRouteError, mapGrokRouteError } from '@/lib/scanRouteErrors';
import { userCanAccessImage } from '@/lib/imageAccess';
import { extractPathnameFromImageRef, isAllowedImagePathname } from '@/lib/imageUrls';
import { writeDiagnosticExtractAudit } from '@/lib/diagnosticExtractAudit';
import { logger } from '@/lib/logger';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { imagePathnamesSchema, parseRequestBody } from '@/lib/validation';

/** Must match DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 100;

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const blocked = blockServiceAdvisorAi(session);
      if (blocked) return blocked;

      const parsed = await parseRequestBody(request, imagePathnamesSchema);
      if ('error' in parsed) return parsed.error;

      const extractStartedAt = Date.now();
      const pathname =
        extractPathnameFromImageRef(parsed.data.imagePathnames[0]) || parsed.data.imagePathnames[0];

      if (!isAllowedImagePathname(pathname)) {
        logger.warn('diagnostics.extract.invalid_pathname', {
          pathname,
          technicianId: session.technicianId,
        });
        return apiError(FORBIDDEN_ERROR, 403);
      }
      const allowed = await userCanAccessImage(session, pathname);
      if (!allowed) {
        logger.warn('diagnostics.extract.image_access_denied', {
          pathname,
          technicianId: session.technicianId,
          dealershipId: session.dealershipId,
        });
        return apiError(IMAGE_ACCESS_ERROR, 403);
      }

      let imageDataUrl: string;
      try {
        imageDataUrl = await fetchPrivateBlobAsDataUrl(pathname);
      } catch (error) {
        const mapped = mapBlobRouteError(error, 'fetch');
        logger.error('diagnostics.extract.blob_fetch_failed', {
          pathname,
          technicianId: session.technicianId,
          status: mapped.status,
          error: mapped.logDetail,
        });
        return apiError(mapped.message, mapped.status);
      }

      try {
        const extracted = await extractDiagnosticsFromImage(imageDataUrl);
        const durationMs = Date.now() - extractStartedAt;

        await writeDiagnosticExtractAudit({
          dealershipId: session.dealershipId,
          technicianId: session.technicianId,
          pathname,
          durationMs,
          extracted,
          ipAddress: getRequestIp(request),
        });

        logger.info('diagnostics.extract.success', {
          technicianId: session.technicianId,
          codeCount: extracted.codes?.length ?? 0,
          faultCodeCount: extracted.faultCodes?.length ?? 0,
          durationMs,
        });
        return extracted;
      } catch (error) {
        const mapped = mapGrokRouteError(error, 'Diagnostic scan');
        logger.error('diagnostics.extract.grok_failed', {
          pathname,
          technicianId: session.technicianId,
          status: mapped.status,
          error: mapped.logDetail,
        });
        return apiError(mapped.message, mapped.status);
      }
    },
    {
      rateLimitKey: 'diagnostics.extract',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      perfEvent: 'route.diagnostics.extract',
    }
  );
}