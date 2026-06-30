/** Shared next/headers test double for integration and critical-path HTTP tests. */

export const COOKIE_JAR_KEY = '__MERLINUS_TEST_COOKIE_JAR__';

export function getCookieJar() {
  if (!globalThis[COOKIE_JAR_KEY]) {
    globalThis[COOKIE_JAR_KEY] = new Map();
  }
  return globalThis[COOKIE_JAR_KEY];
}

export function createMockCookieStore() {
  const jar = getCookieJar();
  const entries = () => [...jar.entries()].map(([name, value]) => ({ name, value }));

  return {
    get(name) {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name, value, _options) {
      jar.set(name, value);
    },
    delete(name) {
      jar.delete(name);
    },
    has(name) {
      return jar.has(name);
    },
    getAll() {
      return entries();
    },
    [Symbol.iterator]() {
      return entries()[Symbol.iterator]();
    },
    get size() {
      return jar.size;
    },
  };
}

export function createCjsCookiesModuleExports() {
  return {
    cookies: () => createMockCookieStore(),
  };
}

export function createCjsNextHeadersExports() {
  return {
    cookies: () => createMockCookieStore(),
    headers: () => new Headers(),
    draftMode: () => ({ isEnabled: false }),
  };
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

export function isNextHeadersSpecifier(specifier) {
  const normalized = normalizePath(specifier);
  return (
    specifier === 'next/headers' ||
    normalized.endsWith('/next/headers') ||
    normalized.endsWith('/next/headers.js')
  );
}

/** True when the request targets Next's cookies implementation (dist, src, or internal relative). */
export function shouldStubNextCookiesModule(request, parent) {
  const req = normalizePath(request);
  const parentFile = parent
    ? normalizePath(parent.filename || parent.id || '')
    : '';

  if (isNextHeadersSpecifier(request)) {
    return true;
  }

  if (
    req.includes('next/dist/server/request/cookies') ||
    req.includes('next/src/server/request/cookies')
  ) {
    return true;
  }

  if (req.endsWith('/server/request/cookies') || req.endsWith('/server/request/cookies.js')) {
    return true;
  }

  if (
    (req === './dist/server/request/cookies' || req === './dist/server/request/cookies.js') &&
    parentFile.includes('/next/')
  ) {
    return true;
  }

  // Do not stub web/spec-extension/cookies (ResponseCookies for NextResponse.json).
  if (
    (req === './cookies' || req === './cookies.js') &&
    (parentFile.includes('/next/dist/server/request/') ||
      parentFile.includes('/next/src/server/request/'))
  ) {
    return true;
  }

  return false;
}

export function isNextCookiesUrl(url) {
  const normalized = normalizePath(url);
  if (isNextHeadersSpecifier(url) || normalized.includes('/next/headers.js')) {
    return true;
  }
  if (normalized.includes('/next/dist/server/web/spec-extension/cookies')) {
    return false;
  }
  return (
    normalized.includes('/next/dist/server/request/cookies') ||
    normalized.includes('/next/src/server/request/cookies')
  );
}

const COOKIES_FN_BODY = `
const jar = globalThis.${COOKIE_JAR_KEY} ?? (globalThis.${COOKIE_JAR_KEY} = new Map());

function createCookieStore() {
  const entries = () => [...jar.entries()].map(([name, value]) => ({ name, value }));
  return {
    get(name) {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name, value, _options) {
      jar.set(name, value);
    },
    delete(name) {
      jar.delete(name);
    },
    has(name) {
      return jar.has(name);
    },
    getAll() {
      return entries();
    },
    [Symbol.iterator]() {
      return entries()[Symbol.iterator]();
    },
    get size() {
      return jar.size;
    },
  };
}

export function cookies() {
  return createCookieStore();
}
`;

export const NEXT_COOKIES_MOCK_SOURCE = COOKIES_FN_BODY;

export const NEXT_HEADERS_MOCK_SOURCE = `${COOKIES_FN_BODY}

export function headers() {
  return new Headers();
}

export function draftMode() {
  return { isEnabled: false };
}
`;