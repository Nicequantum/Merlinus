import { createRequire, register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const loaderPath = join(dirname(fileURLToPath(import.meta.url)), 'server-only-loader.mjs');
register(pathToFileURL(loaderPath).href, import.meta.url);

/** tsx resolves some route deps via CJS require — stub server-only there too. */
const nodeModule = createRequire(import.meta.url)('node:module') as typeof import('node:module') & {
  _load: (request: string, parent: object | null, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function serverOnlyStub(request, parent, isMain) {
  if (request === 'server-only') {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};