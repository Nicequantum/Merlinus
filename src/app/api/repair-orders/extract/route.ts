import { fetchPrivateBlobAsDataUrl } from '@/lib/blob';
import { withAuth } from '@/lib/apiRoute';
import { extractROFromImages } from '@/lib/grok';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { extractPathnameFromImageRef } from '@/lib/imageUrls';
import { imagePathnamesSchema, parseBody } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async () => {
      const body = await request.json();
      const parsed = parseBody(imagePathnamesSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const pathnames = parsed.data.imagePathnames.map((ref) => extractPathnameFromImageRef(ref) || ref);
      const imageDataUrls = await Promise.all(pathnames.map((pathname) => fetchPrivateBlobAsDataUrl(pathname)));
      const extracted = await extractROFromImages(imageDataUrls);
      return extracted;
    },
    { rateLimitKey: 'ro.extract', rateLimit: { limit: 15, windowMs: 60_000 } }
  );
}