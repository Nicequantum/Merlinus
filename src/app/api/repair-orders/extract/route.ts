import { fetchPrivateBlobAsVisionDataUrl } from '@/lib/blob';
import { withAuth } from '@/lib/apiRoute';

import { extractROFromImages } from '@/lib/grok';
import { apiError, FORBIDDEN_ERROR, IMAGE_ACCESS_ERROR } from '@/lib/errors';
import { reportMappedRouteError } from '@/lib/errors';
import { mapBlobRouteError, mapGrokRouteError } from '@/lib/scanRouteErrors';
import { userCanAccessImage } from '@/lib/imageAccess';
import { extractPathnameFromImageRef, isAllowedImagePathname } from '@/lib/imageUrls';
import { logger } from '@/lib/logger';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { auditDealerIdFromSession } from '@/lib/audit';
import { writeRoExtractAudit } from '@/lib/roExtractAudit';
import { imagePathnamesSchema, parseRequestBody } from '@/lib/validation';

/** Must match RO_EXTRACT_ROUTE_MAX_DURATION_S in @/lib/timeouts */
export const maxDuration = 130;

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {

      const parsed = await parseRequestBody(request, imagePathnamesSchema);
      if ('error' in parsed) return parsed.error;

      const extractStartedAt = Date.now();
      const pathnames = parsed.data.imagePathnames.map((ref) => extractPathnameFromImageRef(ref) || ref);

      const accessResults = await Promise.all(
        pathnames.map(async (pathname) => {
          if (!isAllowedImagePathname(pathname)) {
            return { pathname, ok: false as const, reason: 'invalid' as const };
          }
          const allowed = await userCanAccessImage(session, pathname);
          if (!allowed) {
            return { pathname, ok: false as const, reason: 'denied' as const };
          }
          return { pathname, ok: true as const };
        })
      );

      const denied = accessResults.find((result) => !result.ok);
      if (denied && !denied.ok) {
        if (denied.reason === 'invalid') {
          logger.warn('ro.extract.invalid_pathname', {
            pathname: denied.pathname,
            technicianId: session.technicianId,
          });
          return apiError(FORBIDDEN_ERROR, 403);
        }
        logger.warn('ro.extract.image_access_denied', {
          pathname: denied.pathname,
          technicianId: session.technicianId,
          dealershipId: session.dealershipId,
        });
        return apiError(IMAGE_ACCESS_ERROR, 403);
      }

      let imageDataUrls: string[];
      try {
        imageDataUrls = await Promise.all(
          pathnames.map((pathname) => fetchPrivateBlobAsVisionDataUrl(pathname))
        );
      } catch (error) {
        const mapped = mapBlobRouteError(error, 'fetch');
        return reportMappedRouteError(mapped, error, 'ro.extract');
      }

      try {
        const extracted = await extractROFromImages(imageDataUrls);
        const durationMs = Date.now() - extractStartedAt;

        await writeRoExtractAudit({
          dealershipId: session.dealershipId,
          dealerId: auditDealerIdFromSession(session),
          technicianId: session.technicianId,
          pageCount: pathnames.length,
          durationMs,
          extracted,
          ipAddress: getRequestIp(request),
        });

        logger.info('ro.extract.success', {
          technicianId: session.technicianId,
          pageCount: pathnames.length,
          durationMs,
          complaintCount: extracted.complaints?.length ?? 0,
        });
        return extracted;
      } catch (error) {
        const mapped = mapGrokRouteError(error, 'Repair order scan');
        return reportMappedRouteError(mapped, error, 'ro.extract');
      }
    },
    {
      rateLimitKey: 'ro.extract',
      rateLimit: RATE_LIMITS.generate,
      trackUsage: true,
      blockInMaintenance: true,
      blockServiceAdvisorAi: true,
      perfEvent: 'route.ro.extract',
      requireDealershipContext: true,
      requireAuditedAccess: true,
    }
  );
}