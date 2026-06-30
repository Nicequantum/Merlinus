import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { createRequire, register } from 'node:module';

/** Next.js reads globalThis.AsyncLocalStorage at module init — required for route context in Node tests. */
if (!globalThis.AsyncLocalStorage) {
  (globalThis as typeof globalThis & { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage =
    AsyncLocalStorage;
}
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  loadDotenv({ path: envLocalPath });
}

const loaderPath = join(dirname(fileURLToPath(import.meta.url)), 'server-only-loader.mjs');
register(pathToFileURL(loaderPath).href, import.meta.url);

function isBlobModule(request: string): boolean {
  const normalized = request.replace(/\\/g, '/');
  return (
    request === '@/lib/blob' ||
    normalized.endsWith('/src/lib/blob') ||
    normalized.endsWith('/src/lib/blob.ts')
  );
}

/** Stub server-only and blob for direct route imports in Node — cookies use nextRouteContext instead. */
const nodeModule = createRequire(import.meta.url)('node:module') as typeof import('node:module') & {
  _load: (request: string, parent: object | null, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function integrationModuleStubs(
  request: string,
  parent: object | null,
  isMain: boolean
) {
  if (request === 'server-only') {
    return {};
  }

  if (isBlobModule(request)) {
    return {
      fetchPrivateBlobAsDataUrl: async () => 'data:image/png;base64,aW50ZWdyYXRpb24=',
      uploadImageToBlob: async () => {
        throw new Error('uploadImageToBlob not mocked for integration tests');
      },
      streamPrivateBlob: async () => null,
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};