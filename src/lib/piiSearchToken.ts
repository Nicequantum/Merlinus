import 'server-only';

import { createHmac } from 'crypto';

/** Minimum substring length for blind-index RO search tokens. */
const MIN_RO_SEARCH_FRAGMENT_LEN = 2;

function getSearchHmacSecret(): string {
  const secret = process.env.ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set (min 32 chars) for PII search tokens');
  }
  return secret;
}

/** Normalize RO numbers for consistent blind-index hashing. */
export function normalizeRoNumberForSearch(roNumber: string): string {
  return roNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** HMAC-SHA256 blind index for a normalized RO search fragment. */
export function hashRoNumberSearchFragment(fragment: string): string {
  const normalized = normalizeRoNumberForSearch(fragment);
  if (!normalized) return '';
  return createHmac('sha256', getSearchHmacSecret())
    .update(`merlinus-ro-search:${normalized}`)
    .digest('hex');
}

/** Build all substring blind-index tokens for an RO number (supports contains search). */
export function buildRoNumberSearchTokens(roNumber: string): string[] {
  const normalized = normalizeRoNumberForSearch(roNumber);
  if (!normalized) return [];

  const tokens = new Set<string>();
  const maxLen = normalized.length;

  for (let len = MIN_RO_SEARCH_FRAGMENT_LEN; len <= maxLen; len += 1) {
    for (let start = 0; start <= maxLen - len; start += 1) {
      const token = hashRoNumberSearchFragment(normalized.slice(start, start + len));
      if (token) tokens.add(token);
    }
  }

  return Array.from(tokens);
}

/** Build query tokens from a user search term for Prisma `hasSome` matching. */
export function buildRoNumberSearchQueryTokens(term: string): string[] {
  const normalized = normalizeRoNumberForSearch(term);
  if (!normalized) return [];

  if (normalized.length < MIN_RO_SEARCH_FRAGMENT_LEN) {
    const single = hashRoNumberSearchFragment(normalized);
    return single ? [single] : [];
  }

  const tokens = new Set<string>();
  for (let len = MIN_RO_SEARCH_FRAGMENT_LEN; len <= normalized.length; len += 1) {
    for (let start = 0; start <= normalized.length - len; start += 1) {
      const token = hashRoNumberSearchFragment(normalized.slice(start, start + len));
      if (token) tokens.add(token);
    }
  }

  return Array.from(tokens);
}