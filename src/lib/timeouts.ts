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

export const RO_EXTRACT_GROK_MS = 120_000;
/** Sync with `maxDuration` in `src/app/api/repair-orders/extract/route.ts` */
export const RO_EXTRACT_ROUTE_MAX_DURATION_S = 130;
export const RO_EXTRACT_CLIENT_MS = RO_EXTRACT_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS;