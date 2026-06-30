import { existsSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import {
  COOKIE_JAR_KEY,
  createCjsCookiesModuleExports,
  createCjsNextHeadersExports,
  getCookieJar,
  shouldStubNextCookiesModule,
} from './nextHeadersMock.mjs';

getCookieJar();

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

/** tsx resolves route deps via CJS require — stub before any route/auth import. */
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

  if (shouldStubNextCookiesModule(request, parent)) {
    const normalized = String(request).replace(/\\/g, '/');
    if (normalized.includes('headers') || normalized === 'next/headers' || normalized.endsWith('/next/headers.js')) {
      return createCjsNextHeadersExports();
    }
    return createCjsCookiesModuleExports();
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

export { COOKIE_JAR_KEY, getCookieJar };