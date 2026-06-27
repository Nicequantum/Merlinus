/**
 * Write flat Mercedes star SVG for PWA / Apple touch / favicon rasterization.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPlainEmblemStaticSvg } from '../src/lib/merlinLogo/renderPlainStaticSvg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'mercedes-star-plain.svg');

writeFileSync(outPath, `${renderPlainEmblemStaticSvg()}\n`, 'utf8');
console.log('Synced public/mercedes-star-plain.svg (PWA / Apple touch fallback)');