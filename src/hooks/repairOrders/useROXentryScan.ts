'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { analyzeXentryImage } from '@/hooks/repairOrders/roXentryAnalysis';
import {
  isXentryAnalysisFailure,
  xentryAnalysisFailureDetail,
} from '@/hooks/repairOrders/xentryToastHelpers';
import {
  type VisionPipelineControls,
  type VisionPipelineId,
  visionPipelineBlockedMessage,
} from '@/hooks/visionPipeline';
import { clientLog } from '@/lib/clientLog';
import { isRequestAborted } from '@/lib/requestAbort';
import { XENTRY_PENDING_ANALYSIS_OCR, xentryImageNeedsAnalysis } from '@/lib/xentryAnalysisState';
import { warmupOcrWorker } from '@/services/ocr';
import {
  applyXentrySnapshot,
  readXentryBaseline,
  targetKey,
  type XentryTarget,
} from '@/hooks/repairOrders/xentryDataModel';
import type { ImageAttachment, PendingImage, RepairOrder } from '@/types';
import { mergeExtracted } from '@/utils/diagnosticParser';
import { normalizeScanFiles } from '@/utils/scanFileHelpers';
import { fetchImageAttachmentAsFile, uploadFileAsAttachment } from '@/utils/uploadHelpers';

export type { XentryTarget } from '@/hooks/repairOrders/xentryDataModel';

interface UseROXentryScanOptions {
  roRef: MutableRefObject<RepairOrder | null>;
  flushPendingSave: (options?: { maxWaitMs?: number }) => Promise<void>;
  saveROImmediate: (
    ro: RepairOrder | null,
    options?: { throwOnError?: boolean }
  ) => Promise<void>;
  xentryInFlightRef: MutableRefObject<boolean>;
  xentryPipeline: VisionPipelineControls;
  getActivePipeline: () => VisionPipelineId | null;
  /** In-memory RO sync for batch UI — no PUT until batch completes (H2). */
  syncROView: (ro: RepairOrder) => void;
}

/** Queue-and-process workflow for line / RO diagnostic (Xentry) photos — mirrors RO scan UX. */
export function useROXentryScan({
  roRef,
  flushPendingSave,
  saveROImmediate,
  xentryInFlightRef,
  xentryPipeline,
  getActivePipeline,
  syncROView,
}: UseROXentryScanOptions) {
  const [pendingByKey, setPendingByKey] = useState<Record<string, PendingImage[]>>({});
  const sessionRef = useRef(0);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Session cache for on-device OCR when the original File is no longer in pending state. */
  const fileCacheRef = useRef<Map<string, File>>(new Map());
  /** Pending IDs the user deleted while upload was still running — skip RO persist if upload completes late. */
  const discardedPendingIdsRef = useRef<Set<string>>(new Set());

  const clearPendingPreviews = useCallback((images: PendingImage[]) => {
    images.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.previewUrl);
      }
    });
  }, []);

  const getPendingImages = useCallback(
    (target: XentryTarget) => pendingByKey[targetKey(target)] ?? [],
    [pendingByKey]
  );

  const persistAutoSavedImage = useCallback(
    async (
      target: XentryTarget,
      attachment: ImageAttachment,
      file: File,
      pendingId: string
    ): Promise<void> => {
      if (discardedPendingIdsRef.current.has(pendingId)) {
        discardedPendingIdsRef.current.delete(pendingId);
        return;
      }

      const ro = roRef.current;
      if (!ro) {
        throw new Error('Repair order not loaded — go back and reopen the line.');
      }

      const baseline = readXentryBaseline(ro, target);
      const allImages = [...baseline.images, attachment];
      const updatedOcrTexts = [...baseline.ocrTexts, XENTRY_PENDING_ANALYSIS_OCR];
      const persisted = applyXentrySnapshot(
        ro,
        target,
        allImages,
        updatedOcrTexts,
        baseline.extracted
      );

      await saveROImmediate(persisted, { throwOnError: true });
      fileCacheRef.current.set(attachment.id, file);
      syncROView(persisted);

      const key = targetKey(target);
      setPendingByKey((prev) => {
        const list = prev[key] ?? [];
        const img = list.find((p) => p.id === pendingId);
        if (img) clearPendingPreviews([img]);
        const nextList = list.filter((p) => p.id !== pendingId);
        if (nextList.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: nextList };
      });
    },
    [clearPendingPreviews, roRef, saveROImmediate, syncROView]
  );

  const uploadAndSavePending = useCallback(
    async (target: XentryTarget, pendingId: string, file: File) => {
      const key = targetKey(target);
      try {
        const attachment = await uploadFileAsAttachment(file, 'ximg');
        await persistAutoSavedImage(target, attachment, file, pendingId);
      } catch (error) {
        if (discardedPendingIdsRef.current.has(pendingId)) {
          discardedPendingIdsRef.current.delete(pendingId);
          return;
        }
        setPendingByKey((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).map((img) =>
            img.id === pendingId ? { ...img, uploadStatus: 'error' as const } : img
          ),
        }));
        clientLog.error('xentry.auto_save_failed', error);
        toast.error(
          error instanceof Error ? error.message : 'Photo upload failed — delete and try again.'
        );
      }
    },
    [persistAutoSavedImage]
  );

  const appendPendingImages = useCallback(
    async (target: XentryTarget, rawFiles: File[]) => {
      if (rawFiles.length === 0) return;
      if (xentryInFlightRef.current || getActivePipeline() === 'ro_scan') {
        const blocker = getActivePipeline();
        toast.message(
          blocker ? visionPipelineBlockedMessage(blocker) : 'Diagnostic processing already in progress…'
        );
        return;
      }

      if (!roRef.current) {
        toast.error('Repair order not loaded — go back and reopen the line.');
        return;
      }

      try {
        const normalizedFiles = await normalizeScanFiles(rawFiles);
        if (normalizedFiles.length === 0) {
          toast.error('No supported images were selected.');
          return;
        }

        const key = targetKey(target);
        const baseIndex = pendingByKey[key]?.length ?? 0;
        const newImages: PendingImage[] = normalizedFiles.map((file, i) => ({
          id: `ximg-pending-${Date.now()}-${i}`,
          previewUrl: URL.createObjectURL(file),
          name: file.name || `diagnostic-${baseIndex + i + 1}.jpg`,
          file,
          uploadStatus: 'uploading' as const,
        }));

        setPendingByKey((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), ...newImages],
        }));

        toast.success(
          `Saving ${newImages.length} diagnostic photo${newImages.length === 1 ? '' : 's'}…`
        );

        for (const img of newImages) {
          if (img.file) {
            void uploadAndSavePending(target, img.id, img.file);
          }
        }
      } catch (error) {
        clientLog.error('xentry.file_prepare_failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not prepare diagnostic photos.');
      }
    },
    [getActivePipeline, pendingByKey, roRef, uploadAndSavePending, xentryInFlightRef]
  );

  const capturePhoto = useCallback(
    (target: XentryTarget) => {
      if (xentryInFlightRef.current || getActivePipeline() === 'ro_scan') {
        const blocker = getActivePipeline();
        toast.message(
          blocker ? visionPipelineBlockedMessage(blocker) : 'Diagnostic processing already in progress…'
        );
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.multiple = false;
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        await appendPendingImages(target, files);
      };
      input.click();
    },
    [appendPendingImages, getActivePipeline, xentryInFlightRef]
  );

  const addFromGallery = useCallback(
    (target: XentryTarget) => {
      if (xentryInFlightRef.current || getActivePipeline() === 'ro_scan') {
        const blocker = getActivePipeline();
        toast.message(
          blocker ? visionPipelineBlockedMessage(blocker) : 'Diagnostic processing already in progress…'
        );
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        await appendPendingImages(target, files);
      };
      input.click();
    },
    [appendPendingImages, getActivePipeline, xentryInFlightRef]
  );

  const removePendingImage = useCallback(
    (target: XentryTarget, imageId: string) => {
      const key = targetKey(target);
      const pending = pendingByKey[key] ?? [];
      const img = pending.find((p) => p.id === imageId);
      if (!img) return;

      if (img.uploadStatus === 'uploading') {
        discardedPendingIdsRef.current.add(imageId);
      }

      clearPendingPreviews([img]);
      setPendingByKey((prev) => {
        const list = prev[key] ?? [];
        const nextList = list.filter((p) => p.id !== imageId);
        if (nextList.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: nextList };
      });
      toast.message('Queued photo removed');
    },
    [clearPendingPreviews, pendingByKey]
  );

  const clearPending = useCallback(
    (target: XentryTarget) => {
      const key = targetKey(target);
      const pending = pendingByKey[key] ?? [];
      if (pending.length === 0) return;
      pending.forEach((img) => {
        if (img.uploadStatus === 'uploading') {
          discardedPendingIdsRef.current.add(img.id);
        }
      });
      clearPendingPreviews(pending);
      setPendingByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.message('Queued diagnostic photos cleared');
    },
    [clearPendingPreviews, pendingByKey]
  );

  const cancelProcessing = useCallback(() => {
    sessionRef.current += 1;
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    xentryInFlightRef.current = false;
    xentryPipeline.finish();
    // L5: match RO scan cancel — abort in-flight work and clear all queued diagnostic photos.
    setPendingByKey((prev) => {
      Object.values(prev).forEach((images) => {
        images.forEach((img) => {
          if (img.uploadStatus === 'uploading') {
            discardedPendingIdsRef.current.add(img.id);
          }
        });
        clearPendingPreviews(images);
      });
      return {};
    });
    toast.message('Diagnostic processing cancelled');
  }, [clearPendingPreviews, xentryInFlightRef, xentryPipeline]);

  const toastProcessResult = useCallback((fileCount: number, ocrTexts: string[]) => {
    const failedTexts = ocrTexts.filter(isXentryAnalysisFailure);
    const failed = failedTexts.length;
    if (failed === fileCount) {
      const firstFailure = failedTexts[0];
      toast.error(firstFailure ? xentryAnalysisFailureDetail(firstFailure) : 'Diagnostic analysis failed.');
      return;
    }
    if (failed > 0) {
      toast.warning(
        `${fileCount - failed} photo${fileCount - failed === 1 ? '' : 's'} analyzed; ${failed} need a retake or sharper image.`
      );
      return;
    }
    toast.success(
      `${fileCount} diagnostic photo${fileCount === 1 ? '' : 's'} processed — tap Generate MI 4.3 to use extracted data.`
    );
  }, []);

  const resolveAnalysisFile = useCallback(
    async (attachment: ImageAttachment): Promise<File> => {
      const cached = fileCacheRef.current.get(attachment.id);
      if (cached) return cached;
      const fetched = await fetchImageAttachmentAsFile(attachment);
      fileCacheRef.current.set(attachment.id, fetched);
      return fetched;
    },
    []
  );

  const processPending = useCallback(
    async (target: XentryTarget) => {
      const key = targetKey(target);
      const pending = pendingByKey[key] ?? [];
      const stillUploading = pending.some((img) => img.uploadStatus === 'uploading');
      if (stillUploading) {
        toast.message('Wait for photos to finish saving before processing.');
        return;
      }
      if (xentryInFlightRef.current) {
        toast.message('Diagnostic processing already in progress…');
        return;
      }
      if (!xentryPipeline.tryAcquire()) {
        const blocker = getActivePipeline();
        if (blocker) toast.message(visionPipelineBlockedMessage(blocker));
        return;
      }

      const sessionId = ++sessionRef.current;
      const isActive = () => sessionRef.current === sessionId && !cancelledRef.current;

      cancelledRef.current = false;
      xentryInFlightRef.current = true;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await flushPendingSave({ maxWaitMs: 2_500 });
        if (!isActive()) return;

        const ro = roRef.current;
        if (!ro) {
          throw new Error('Repair order not loaded — go back and reopen the line.');
        }

        const baseline = readXentryBaseline(ro, target);
        const indicesToAnalyze = baseline.images
          .map((img, index) => ({ img, index }))
          .filter(({ index }) => xentryImageNeedsAnalysis(baseline.ocrTexts, index));

        if (indicesToAnalyze.length === 0) {
          toast.message('Add at least one diagnostic photo before processing.');
          return;
        }

        const allImages = [...baseline.images];
        let updatedOcrTexts = [...baseline.ocrTexts];
        let updatedExtracted = baseline.extracted;

        syncROView(
          applyXentrySnapshot(ro, target, allImages, updatedOcrTexts, updatedExtracted)
        );
        if (!isActive()) return;

        xentryPipeline.start('Running AI vision extraction…');
        xentryPipeline.setProgress(12);
        xentryPipeline.setStatusMessage(
          `Analyzing ${indicesToAnalyze.length} diagnostic photo${indicesToAnalyze.length === 1 ? '' : 's'}…`
        );
        void warmupOcrWorker().catch((error) => {
          clientLog.warn('xentry.ocr_warmup_failed', error);
        });

        for (let pass = 0; pass < indicesToAnalyze.length; pass++) {
          if (!isActive()) break;

          const { img: attachment, index: ocrIndex } = indicesToAnalyze[pass]!;
          const file = await resolveAnalysisFile(attachment);

          xentryPipeline.setStatusMessage(
            `Analyzing photo ${pass + 1} of ${indicesToAnalyze.length} (fault codes, measurements, guided tests)…`
          );

          updatedOcrTexts = updatedOcrTexts.map((text, idx) =>
            idx === ocrIndex ? '[Analyzing diagnostic photo…]' : text
          );
          const progressRo = roRef.current;
          if (progressRo) {
            syncROView(
              applyXentrySnapshot(progressRo, target, allImages, updatedOcrTexts, updatedExtracted)
            );
          }

          try {
            const result = await analyzeXentryImage(
              file,
              attachment,
              (p) => {
                if (!isActive()) return;
                const slice = 12 + ((pass + p / 100) / indicesToAnalyze.length) * 82;
                xentryPipeline.setProgress(Math.round(slice));
              },
              { signal: abortController.signal }
            );
            if (!isActive()) break;

            updatedExtracted = mergeExtracted(updatedExtracted, result.extracted);
            updatedOcrTexts = updatedOcrTexts.map((text, idx) =>
              idx === ocrIndex ? result.text : text
            );
          } catch (err) {
            if (isRequestAborted(err) || !isActive()) break;
            clientLog.warn('xentry.analysis_failed', err);
            updatedOcrTexts = updatedOcrTexts.map((text, idx) =>
              idx === ocrIndex ? '[Analysis failed for this image]' : text
            );
          }

          if (!isActive()) break;

          const midRo = roRef.current;
          if (midRo) {
            syncROView(
              applyXentrySnapshot(midRo, target, allImages, updatedOcrTexts, updatedExtracted)
            );
          }
        }

        if (!isActive()) return;

        const finalRo = roRef.current;
        if (!finalRo) {
          throw new Error('Repair order not loaded — go back and reopen the line.');
        }
        const persisted = applyXentrySnapshot(
          finalRo,
          target,
          allImages,
          updatedOcrTexts,
          updatedExtracted
        );
        await saveROImmediate(persisted, { throwOnError: true });
        if (!isActive()) return;

        xentryPipeline.setProgress(100);
        xentryPipeline.setStatusMessage('Diagnostic extraction complete');

        const analyzedTexts = indicesToAnalyze.map(({ index }) => updatedOcrTexts[index] ?? '');
        toastProcessResult(indicesToAnalyze.length, analyzedTexts);
      } catch (error) {
        if (!isActive() || isRequestAborted(error)) return;
        clientLog.error('xentry.process_failed', error);
        toast.error(error instanceof Error ? error.message : 'Failed to process diagnostic photos');
      } finally {
        abortControllerRef.current = null;
        if (sessionRef.current === sessionId) {
          xentryInFlightRef.current = false;
          xentryPipeline.finish();
        }
      }
    },
    [
      flushPendingSave,
      getActivePipeline,
      pendingByKey,
      resolveAnalysisFile,
      roRef,
      saveROImmediate,
      syncROView,
      toastProcessResult,
      xentryInFlightRef,
      xentryPipeline,
    ]
  );

  return {
    getPendingImages,
    capturePhoto,
    addFromGallery,
    processPending,
    clearPending,
    cancelProcessing,
    removePendingImage,
  };
};