import { NextResponse } from 'next/server';
import { getPwaManifest } from '@/lib/pwaManifest';

/** Public manifest alias for legacy /manifest.json requests. */
export function GET() {
  return NextResponse.json(getPwaManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}