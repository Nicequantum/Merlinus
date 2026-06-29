/**
 * Shared timeout hierarchy for vision extraction:
 * client timeout > route maxDuration > Grok API timeout
 * (each layer keeps headroom for the layer below)
 *
 * Route maxDuration must be a numeric literal in each route file (Next.js requirement).
 * Keep those literals in sync with the constants below.
 */

/** Buffer between Grok abort and Vercel route kill (blob fetch, JSON parse, etc.) */
export const ROUTE_BUFFER_S = 10;

/** Buffer between route maxDuration and client abort (network round-trip) */
export const CLIENT_BUFFER_MS = 10_000;

export const DIAGNOSTIC_EXTRACT_GROK_MS = 90_000;
/** Sync with `maxDuration` in `src/app/api/diagnostics/extract/route.ts` */
export const DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S = 100;
export const DIAGNOSTIC_EXTRACT_CLIENT_MS =
  DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;

/** RO scan vision — quality-first; technicians may wait several minutes while driving. */
export const RO_EXTRACT_GROK_MS = 180_000;
/** Sync with `maxDuration` in `src/app/api/repair-orders/extract/route.ts` */
export const RO_EXTRACT_ROUTE_MAX_DURATION_S = 190;
export const RO_EXTRACT_CLIENT_MS = RO_EXTRACT_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;

/** Fail fast — non-reasoning model should answer in <25s; abort rather than hang minutes. */
export const STORY_GENERATE_GROK_MS = 25_000;
/** Sync with `maxDuration` in `generate-story/route.ts` */
export const STORY_GENERATE_ROUTE_MAX_DURATION_S = 60;
export const STORY_GENERATE_CLIENT_MS =
  STORY_GENERATE_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;

export const STORY_SCORE_GROK_MS = 30_000;
/** Sync with `maxDuration` in `score-story/route.ts` */
export const STORY_SCORE_ROUTE_MAX_DURATION_S = 45;
export const STORY_SCORE_CLIENT_MS = STORY_SCORE_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;

export const STORY_REVIEW_GROK_MS = 90_000;
/** Sync with `maxDuration` in `review-story/route.ts` */
export const STORY_REVIEW_ROUTE_MAX_DURATION_S = 120;
export const STORY_REVIEW_CLIENT_MS = STORY_REVIEW_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;

/** Image upload during RO/diagnostic scans — allow slow dealership uplinks. */
export const UPLOAD_CLIENT_MS = 60_000;