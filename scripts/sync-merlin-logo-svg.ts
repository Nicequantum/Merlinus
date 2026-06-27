/**
 * Write premium in-app Merlin logo SVG from renderMerlinLogoStaticSvg().
 * Matches MercedesStarMark (3D metallic emblem) — not used for PWA / Apple touch PNGs.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMerlinLogoStaticSvg } from '../src/lib/merlinLogo/renderStaticSvg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'mercedes-star-icon.svg');

writeFileSync(outPath, `${renderMerlinLogoStaticSvg()}\n`, 'utf8');
console.log('Synced public/mercedes-star-icon.svg from src/lib/merlinLogo');