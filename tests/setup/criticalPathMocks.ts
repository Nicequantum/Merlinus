import { createRequire } from 'node:module';
import { COOKIE_JAR_KEY, getCookieJar } from './nextHeadersMock.mjs';

const SESSION_COOKIE = 'benz_tech_session';

const nodeModule = createRequire(import.meta.url)('node:module') as typeof import('node:module') & {
  _load: (request: string, parent: object | null, isMain: boolean) => unknown;
};

const previousLoad = nodeModule._load;

function isBlobModule(request: string): boolean {
  const normalized = request.replace(/\\/g, '/');
  return (
    request === '@/lib/blob' ||
    normalized.endsWith('/src/lib/blob') ||
    normalized.endsWith('/src/lib/blob.ts')
  );
}

nodeModule._load = function criticalPathMocks(request, parent, isMain) {
  if (isBlobModule(request)) {
    return {
      fetchPrivateBlobAsDataUrl: async () => 'data:image/png;base64,aW50ZWdyYXRpb24=',
      uploadImageToBlob: async () => {
        throw new Error('uploadImageToBlob not mocked for critical-path tests');
      },
      streamPrivateBlob: async () => null,
    };
  }

  return previousLoad.call(this, request, parent, isMain);
};

export function getMockSessionCookie(): string | undefined {
  return getCookieJar().get(SESSION_COOKIE);
}

export function clearCriticalPathMocks(): void {
  getCookieJar().clear();
}

export { COOKIE_JAR_KEY };