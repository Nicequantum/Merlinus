/**
 * Rasterize public/mercedes-star-icon.svg into PWA + Apple touch PNGs.
 * Run: node scripts/generate-app-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const svgPath = join(publicDir, 'mercedes-star-icon.svg');
const svg = readFileSync(svgPath);

function svgDensityForSize(size) {
  // Higher density for Apple touch sizes keeps edges crisp on Retina home screens.
  if (size <= 180) return Math.min(256, Math.max(144, Math.round(size * 1.4)));
  return Math.min(192, Math.max(72, Math.round(size * 0.75)));
}

async function writePng(size, filename) {
  const out = join(publicDir, filename);
  await sharp(svg, { density: svgDensityForSize(size) })
    .resize(size, size, { fit: 'contain', background: { r: 8, g: 8, b: 10, alpha: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(out);
  console.log(`  ${filename} (${size}×${size})`);
}

/** Maskable safe zone — logo scaled to ~78% centered. */
async function writeMaskablePng(size, filename) {
  const logoSize = Math.round(size * 0.78);
  const offset = Math.round((size - logoSize) / 2);
  const logo = await sharp(svg, { density: svgDensityForSize(logoSize) })
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const out = join(publicDir, filename);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 8, g: 8, b: 10, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ${filename} (${size}×${size} maskable)`);
}

async function writeFavicon() {
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((size) =>
      sharp(svg, { density: 128 })
        .resize(size, size, { fit: 'contain', background: { r: 8, g: 8, b: 10, alpha: 1 } })
        .png()
        .toBuffer()
    )
  );
  const ico = await toIco(buffers);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
  console.log('  favicon.ico (16, 32, 48)');
}

async function main() {
  console.log('Generating Merlin app icons from mercedes-star-icon.svg…');

  const appleSizes = [
    [180, 'apple-touch-icon.png'],
    [167, 'apple-touch-icon-167.png'],
    [152, 'apple-touch-icon-152.png'],
    [120, 'apple-touch-icon-120.png'],
  ];

  for (const [size, name] of appleSizes) {
    await writePng(size, name);
  }

  await writePng(180, 'apple-touch-icon-precomposed.png');

  await writePng(192, 'icon-192.png');
  await writePng(512, 'icon-512.png');
  await writePng(1024, 'icon-1024.png');
  await writeMaskablePng(512, 'icon-512-maskable.png');

  // Legacy alias
  await writePng(167, 'icon-167.png');

  await writeFavicon();

  // Keep logo.svg in sync for static references
  writeFileSync(join(publicDir, 'logo.svg'), svg);
  console.log('  logo.svg (synced)');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});