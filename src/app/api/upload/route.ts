import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { uploadImageToBlob } from '@/lib/blob';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';
import { mapAuditRouteError, mapBlobRouteError } from '@/lib/scanRouteErrors';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

type UploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function isUploadFile(value: unknown): value is UploadFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof (value as UploadFile).arrayBuffer === 'function' &&
    'name' in value &&
    'type' in value &&
    'size' in value
  );
}

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!isUploadFile(file)) {
        return apiError(VALIDATION_ERROR, 400);
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        return apiError(`Unsupported image type "${file.type}". Use JPEG, PNG, WebP, GIF, or HEIC.`, 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return apiError('Image must be smaller than 8 MB.', 400);
      }

      let uploaded;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        uploaded = await uploadImageToBlob(buffer, file.name, file.type);
      } catch (error) {
        const mapped = mapBlobRouteError(error, 'upload');
        logger.error('upload.blob_failed', {
          technicianId: session.technicianId,
          dealershipId: session.dealershipId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          status: mapped.status,
          error: mapped.logDetail,
        });
        return apiError(mapped.message, mapped.status);
      }

      try {
        await writeAuditLog({
          action: 'image.upload',
          dealershipId: session.dealershipId,
          technicianId: session.technicianId,
          entityType: 'image',
          entityId: uploaded.pathname,
          metadata: { pathname: uploaded.pathname, size: file.size },
          ipAddress: getRequestIp(request),
        });
      } catch (error) {
        const mapped = mapAuditRouteError(error);
        logger.error('upload.audit_failed', {
          technicianId: session.technicianId,
          dealershipId: session.dealershipId,
          pathname: uploaded.pathname,
          status: mapped.status,
          error: mapped.logDetail,
        });
        return apiError(mapped.message, mapped.status);
      }

      return { pathname: uploaded.pathname, url: uploaded.url, name: file.name };
    },
    { rateLimitKey: 'upload', rateLimit: RATE_LIMITS.upload }
  );
}