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

export function createCjsNextHeadersExports() {
  return {
    cookies: () => createMockCookieStore(),
    headers: () => new Headers(),
    draftMode: () => ({ isEnabled: false }),
  };
}

export function isNextHeadersSpecifier(specifier) {
  const normalized = String(specifier).replace(/\\/g, '/');
  return (
    specifier === 'next/headers' ||
    normalized.endsWith('/next/headers') ||
    normalized.endsWith('/next/headers.js')
  );
}

export const NEXT_HEADERS_MOCK_SOURCE = `
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

export function headers() {
  return new Headers();
}

export function draftMode() {
  return { isEnabled: false };
}
`;