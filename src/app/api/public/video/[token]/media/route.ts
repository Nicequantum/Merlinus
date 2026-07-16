import { getRlsDb, withRlsBypass } from '@/lib/apex/rlsContext';
import { apiError, NOT_FOUND_ERROR } from '@/lib/errors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hashShareToken } from '@/lib/videoInspection/shareTokens';
import { isAllowedVideoPathname, streamPrivateVideoBlob } from '@/lib/videoBlob';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rateLimited = await checkRateLimit(request, 'video.public_media', RATE_LIMITS.default);
  if (rateLimited) return rateLimited;

  const { token } = await params;
  const raw = token?.trim();
  if (!raw || raw.length < 16) return apiError(NOT_FOUND_ERROR, 404);

  const tokenHash = hashShareToken(raw);
  const share = await withRlsBypass(async () =>
    getRlsDb().videoInspectionShare.findUnique({
      where: { tokenHash },
      include: { videoInspection: true },
    })
  );

  if (!share || share.revokedAt) return apiError(NOT_FOUND_ERROR, 404);
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return apiError('This inspection link has expired.', 410);
  }

  if (share.passcodeHash) {
    const provided = request.headers.get('x-video-passcode')?.trim() || '';
    const { createHash } = await import('crypto');
    const providedHash = createHash('sha256').update(provided).digest('hex');
    if (!provided || providedHash !== share.passcodeHash) {
      return apiError('Passcode required', 401);
    }
  }

  const pathname = share.videoInspection.videoPathname;
  if (!pathname || !isAllowedVideoPathname(pathname)) {
    return apiError(NOT_FOUND_ERROR, 404);
  }

  try {
    const result = await streamPrivateVideoBlob(pathname);
    if (!result) return apiError(NOT_FOUND_ERROR, 404);
    return new Response(result.stream, {
      status: 200,
      headers: {
        'Content-Type':
          share.videoInspection.contentType || result.blob.contentType || 'video/webm',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return apiError(NOT_FOUND_ERROR, 404);
  }
}
