import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPwaManifest } from '../src/lib/pwaManifest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'manifest.json');

writeFileSync(outPath, `${JSON.stringify(getPwaManifest(), null, 2)}\n`, 'utf8');
console.log('Synced public/manifest.json from getPwaManifest()');