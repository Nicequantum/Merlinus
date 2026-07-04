import { clientLog } from '@/lib/clientLog';

/** RO scan upload — balances Grok vision legibility with fast uplink transfer. */
export const RO_SCAN_UPLOAD_MAX_DIM = 1400;
export const RO_SCAN_UPLOAD_QUALITY = 0.82;
export const RO_SCAN_UPLOAD_SKIP_BYTES = 700_000;

export async function compressImageForRoScan(file: File): Promise<File> {
  return compressImageForUpload(
    file,
    RO_SCAN_UPLOAD_MAX_DIM,
    RO_SCAN_UPLOAD_QUALITY,
    RO_SCAN_UPLOAD_SKIP_BYTES
  );
}

export async function compressImageForUpload(
  file: File,
  maxDim = 1600,
  quality = 0.72,
  skipBelowBytes = 900_000
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const img = await loadImage(file);
  try {
    let { width, height } = img;
    if (Math.max(width, height) <= maxDim && file.size < skipBelowBytes) {
      return file;
    }
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToJpegBlob(canvas, quality);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    clientLog.warn('image.compression_failed', e);
    return file;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to compress image'))),
      'image/jpeg',
      quality
    );
  });
}