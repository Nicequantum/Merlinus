import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { uploadImageToBlob } from '@/lib/blob';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp, RATE_LIMITS } from '@/lib/rate-limit';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
        return apiError('Only JPEG, PNG, WebP, and GIF images are allowed.', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return apiError('Image must be smaller than 8 MB.', 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadImageToBlob(buffer, file.name, file.type);

      await writeAuditLog({
        action: 'image.upload',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        metadata: { filename: file.name, size: file.size, pathname: uploaded.pathname },
        ipAddress: getRequestIp(request),
      });

      return { pathname: uploaded.pathname, url: uploaded.url, name: file.name };
    },
    { rateLimitKey: 'upload', rateLimit: RATE_LIMITS.upload }
  );
}