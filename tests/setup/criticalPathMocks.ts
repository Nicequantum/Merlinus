import { getCookieJar } from './nextHeadersMock.mjs';

const SESSION_COOKIE = 'benz_tech_session';

/** Re-export helpers; all module stubs are registered in integration.ts before tests load. */
export function getMockSessionCookie(): string | undefined {
  return getCookieJar().get(SESSION_COOKIE);
}

export function clearCriticalPathMocks(): void {
  getCookieJar().clear();
}