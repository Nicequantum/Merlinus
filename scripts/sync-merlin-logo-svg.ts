/**
 * Write canonical Merlin logo SVG from shared renderMerlinLogoStaticSvg().
 * Used by generate-app-icons.mjs so PNGs match MercedesStarMark exactly.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMerlinLogoStaticSvg } from '../src/lib/merlinLogo/renderStaticSvg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'mercedes-star-icon.svg');

writeFileSync(outPath, `${renderMerlinLogoStaticSvg()}\n`, 'utf8');
console.log('Synced public/mercedes-star-icon.svg from src/lib/merlinLogo');