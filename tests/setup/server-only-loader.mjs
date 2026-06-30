/**
 * Integration tests import Next.js route handlers directly in Node.
 * Stub `server-only` and `next/headers` so route dependency graphs load outside the Next bundler.
 */

import {
  isNextHeadersSpecifier,
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

  return nextResolve(specifier, context);
}