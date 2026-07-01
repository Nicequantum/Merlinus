import { api, ApiError } from '@/lib/api';
import {
  isNetworkFailure,
  isRetriableHttpStatus,
  networkRetryDelayMs,
  sleep,
} from '@/lib/networkErrors';
import type { ImageAttachment } from '@/types';
import { compressImageForRoScan, compressImageForUpload } from '@/utils/imageCompression';

const UPLOAD_CONCURRENCY = 3;
const RO_SCAN_UPLOAD_CONCURRENCY = 6;
const UPLOAD_PER_FILE_ATTEMPTS = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function isRetriableUploadError(error: unknown): boolean {
  if (error instanceof ApiError) return isRetriableHttpStatus(error.status);
  return isNetworkFailure(error);
}

export async function uploadFileAsAttachment(
  file: File,
  idPrefix: string,
  compress: (file: File) => Promise<File> = compressImageForUpload
): Promise<ImageAttachment> {
  let lastError: unknown;

  for (let attempt = 0; attempt < UPLOAD_PER_FILE_ATTEMPTS; attempt++) {
    try {
      const compressed = await compress(file);
      const { pathname, url, name } = await api.uploadImage(compressed);
      return {
        id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pathname,
        url,
        name: name || file.name,
      };
    } catch (error) {
      lastError = error;
      if (!isRetriableUploadError(error) || attempt === UPLOAD_PER_FILE_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(networkRetryDelayMs(attempt));
    }
  }

  throw lastError;
}

export async function uploadFilesAsAttachments(files: File[], idPrefix: string): Promise<ImageAttachment[]> {
  return mapWithConcurrency(files, UPLOAD_CONCURRENCY, (file) =>
    uploadFileAsAttachment(file, idPrefix)
  );
}

/** Higher concurrency + vision-tuned compression for RO document scans. */
export async function uploadRoScanAttachments(files: File[]): Promise<ImageAttachment[]> {
  return mapWithConcurrency(files, RO_SCAN_UPLOAD_CONCURRENCY, (file) =>
    uploadFileAsAttachment(file, 'roimg', compressImageForRoScan)
  );
}