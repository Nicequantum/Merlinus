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
import { warmupOcrWorker } from '@/services/ocr';
import {
  applyXentrySnapshot,
  readXentryBaseline,
  targetKey,
  type XentryTarget,
} from '@/hooks/repairOrders/xentryDataModel';
import type { PendingImage, RepairOrder } from '@/types';
import { mergeExtracted } from '@/utils/diagnosticParser';
import { normalizeScanFiles } from '@/utils/scanFileHelpers';
import { uploadFilesAsAttachments } from '@/utils/uploadHelpers';

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

  const clearPendingPreviews = useCallback((images: PendingImage[]) => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }, []);

  const getPendingImages = useCallback(
    (target: XentryTarget) => pendingByKey[targetKey(target)] ?? [],
    [pendingByKey]
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
        }));

        setPendingByKey((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), ...newImages],
        }));

        const total = baseIndex + newImages.length;
        toast.success(
          `Added ${newImages.length} diagnostic photo${newImages.length === 1 ? '' : 's'} (${total} queued). Tap Process when ready.`
        );
      } catch (error) {
        clientLog.error('xentry.file_prepare_failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not prepare diagnostic photos.');
      }
    },
    [getActivePipeline, pendingByKey, xentryInFlightRef]
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

  const clearPending = useCallback(
    (target: XentryTarget) => {
      const key = targetKey(target);
      const pending = pendingByKey[key] ?? [];
      if (pending.length === 0) return;
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
      Object.values(prev).forEach((images) => clearPendingPreviews(images));
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

  const processPending = useCallback(
    async (target: XentryTarget) => {
      const key = targetKey(target);
      const pending = pendingByKey[key] ?? [];
      if (pending.length === 0) {
        toast.message('Add at least one diagnostic photo before processing.');
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

      const snapshot = [...pending];
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
        const files = snapshot.map((img) => img.file);

        xentryPipeline.start('Uploading diagnostic photos…');
        xentryPipeline.setProgress(8);
        xentryPipeline.setStatusMessage(
          `Uploading ${files.length} diagnostic photo${files.length === 1 ? '' : 's'}…`
        );

        const newAttachments = await uploadFilesAsAttachments(files, 'ximg');
        if (!isActive()) return;

        const allImages = [...baseline.images, ...newAttachments];
        let updatedOcrTexts = [
          ...baseline.ocrTexts,
          ...files.map(() => '[Analyzing diagnostic photo…]'),
        ];
        let updatedExtracted = baseline.extracted;

        syncROView(
          applyXentrySnapshot(ro, target, allImages, updatedOcrTexts, updatedExtracted)
        );
        if (!isActive()) return;

        xentryPipeline.setProgress(18);
        xentryPipeline.setStatusMessage('Photos saved — running AI vision extraction…');
        void warmupOcrWorker().catch((error) => {
          clientLog.warn('xentry.ocr_warmup_failed', error);
        });

        for (let i = 0; i < files.length; i++) {
          if (!isActive()) break;

          const file = files[i]!;
          const attachment = newAttachments[i]!;
          const ocrIndex = baseline.ocrTexts.length + i;

          xentryPipeline.setStatusMessage(
            `Analyzing photo ${i + 1} of ${files.length} (fault codes, measurements, guided tests)…`
          );

          try {
            const result = await analyzeXentryImage(
              file,
              attachment,
              (p) => {
                if (!isActive()) return;
                const slice = 18 + ((i + p / 100) / files.length) * 78;
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

          const progressRo = roRef.current;
          if (progressRo) {
            syncROView(
              applyXentrySnapshot(
                progressRo,
                target,
                allImages,
                updatedOcrTexts,
                updatedExtracted
              )
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

        clearPendingPreviews(snapshot);
        setPendingByKey((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });

        toastProcessResult(files.length, updatedOcrTexts.slice(baseline.ocrTexts.length));
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
      clearPendingPreviews,
      flushPendingSave,
      getActivePipeline,
      pendingByKey,
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
  };
}