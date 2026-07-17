/** Pick a MediaRecorder mime type supported on this device. */
export function pickMediaRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return '';
}

export function extensionForMime(mime: string): 'webm' | 'mp4' {
  if (mime.includes('mp4') || mime.includes('quicktime')) return 'mp4';
  return 'webm';
}

export function isMediaRecorderAvailable(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
}
