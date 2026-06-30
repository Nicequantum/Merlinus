import { createRequire } from 'node:module';
import { SESSION_COOKIE } from '../../src/lib/auth';

const cookieJar = new Map<string, string>();

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
  if (request === 'next/headers') {
    return {
      cookies: async () => ({
        get: (name: string) => {
          const value = cookieJar.get(name);
          return value === undefined ? undefined : { name, value };
        },
        set: (name: string, value: string) => {
          cookieJar.set(name, value);
        },
        delete: (name: string) => {
          cookieJar.delete(name);
        },
        has: (name: string) => cookieJar.has(name),
        getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
      }),
    };
  }

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
  return cookieJar.get(SESSION_COOKIE);
}

export function clearCriticalPathMocks(): void {
  cookieJar.clear();
}