import { LAST_REQUEST_STORE_KEY, runWithNextRouteContext } from './nextRouteContext.mjs';

const SESSION_COOKIE = 'benz_tech_session';

type RequestStoreRef = {
  mutableCookies?: { get: (name: string) => { value: string } | undefined };
};

export function getMockSessionCookie(): string | undefined {
  const store = (globalThis as typeof globalThis & Record<string, unknown>)[
    LAST_REQUEST_STORE_KEY
  ] as RequestStoreRef | undefined;
  return store?.mutableCookies?.get(SESSION_COOKIE)?.value;
}

export function clearCriticalPathMocks(): void {
  delete (globalThis as typeof globalThis & Record<string, unknown>)[LAST_REQUEST_STORE_KEY];
}

export { runWithNextRouteContext };