import { existsSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import {
  COOKIE_JAR_KEY,
  createCjsNextHeadersExports,
  getCookieJar,
  isNextHeadersSpecifier,
} from './nextHeadersMock.mjs';

getCookieJar();

const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  loadDotenv({ path: envLocalPath });
}

const loaderPath = join(dirname(fileURLToPath(import.meta.url)), 'server-only-loader.mjs');
register(pathToFileURL(loaderPath).href, import.meta.url);

/** tsx resolves some route deps via CJS require — stub server-only and next/headers before any route import. */
const nodeModule = createRequire(import.meta.url)('node:module') as typeof import('node:module') & {
  _load: (request: string, parent: object | null, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function integrationModuleStubs(request, parent, isMain) {
  if (request === 'server-only') {
    return {};
  }
  if (isNextHeadersSpecifier(request)) {
    return createCjsNextHeadersExports();
  }
  return originalLoad.call(this, request, parent, isMain);
};

export { COOKIE_JAR_KEY, getCookieJar };