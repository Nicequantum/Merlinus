import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLog';
import type { VideoInspectionDetail } from '@/types';
import type { VideoMpiCaptureResult } from './types';

export interface VideoMpiUploadInput {
  result: VideoMpiCaptureResult;
  title?: string;
  vehicleLabel?: string;
  transcript?: string;
  transcriptLanguage?: string;
}

/**
 * Persist a finalized capture. Single-shot FormData (server maxDuration 180s).
 * One automatic retry on retriable network failures.
 */
export async function uploadVideoMpiCapture(
  input: VideoMpiUploadInput
): Promise<VideoInspectionDetail> {
  const { result } = input;
  if (!result.blob?.size) {
    throw new Error('No video data to upload');
  }

  const buildForm = () => {
    const form = new FormData();
    form.append('file', result.blob, `inspection.${result.extension}`);
    form.append('title', (input.title || 'Video inspection').slice(0, 200));
    if (input.vehicleLabel?.trim()) {
      form.append('vehicleLabel', input.vehicleLabel.trim().slice(0, 200));
    }
    if (input.transcript) {
      form.append('transcript', input.transcript.slice(0, 20_000));
    }
    if (input.transcriptLanguage) {
      form.append('transcriptLanguage', input.transcriptLanguage);
    }
    form.append('durationSec', String(Math.max(1, Math.round(result.durationSec))));
    for (const [i, frame] of result.frames.slice(0, 8).entries()) {
      form.append('frames', frame, `frame-${i}.jpg`);
    }
    return form;
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      clientLog.info('video_mpi.upload_start', {
        attempt,
        bytes: result.blob.size,
        durationSec: result.durationSec,
        frameCount: result.frames.length,
      });
      const { inspection } = await api.uploadVideoInspection(buildForm());
      clientLog.info('video_mpi.upload_ok', { id: inspection.id, attempt });
      return inspection;
    } catch (error) {
      lastError = error;
      clientLog.warn('video_mpi.upload_failed', {
        attempt,
        error: error instanceof Error ? error.message : 'unknown',
      });
      // brief backoff before single retry
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed');
}
