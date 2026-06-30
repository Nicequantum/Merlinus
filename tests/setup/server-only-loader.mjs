/**
 * Integration tests import Next.js route handlers directly in Node.
 * Stub server-only and all next/headers resolution paths (including tsx loading next/src).
 */

import {
  isNextCookiesUrl,
  isNextHeadersSpecifier,
  NEXT_COOKIES_MOCK_SOURCE,
  NEXT_HEADERS_MOCK_SOURCE,
} from './nextHeadersMock.mjs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'data:text/javascript,export default undefined',
    };
  }

  if (isNextHeadersSpecifier(specifier)) {
    return {
      format: 'module',
      shortCircuit: true,
      url: `data:text/javascript,${encodeURIComponent(NEXT_HEADERS_MOCK_SOURCE)}`,
    };
  }

  const normalized = String(specifier).replace(/\\/g, '/');
  if (
    normalized.includes('next/dist/server/request/cookies') ||
    normalized.includes('next/src/server/request/cookies')
  ) {
    return {
      format: 'module',
      shortCircuit: true,
      url: `data:text/javascript,${encodeURIComponent(NEXT_COOKIES_MOCK_SOURCE)}`,
    };
  }

  return nextResolve(specifier, context);
}

