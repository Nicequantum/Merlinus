import { createHash, randomBytes } from 'crypto';

export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function buildCustomerViewerUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.MERLIN_BASE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return `${base.replace(/\/$/, '')}/v/${encodeURIComponent(token)}`;
}

export function getVideoMaxBytes(): number {
  const mb = Number(process.env.VIDEO_INSPECTION_MAX_MB);
  if (Number.isFinite(mb) && mb > 0) return Math.floor(mb * 1024 * 1024);
  return 100 * 1024 * 1024;
}

export function getVideoMaxDurationSec(): number {
  const sec = Number(process.env.VIDEO_INSPECTION_MAX_DURATION_SEC);
  if (Number.isFinite(sec) && sec > 0) return Math.floor(sec);
  return 300;
}
