'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { analyzeXentryImage } from '@/hooks/repairOrders/roXentryAnalysis';
import { clientLog } from '@/lib/clientLog';
import { warmupOcrWorker } from '@/services/ocr';
import type { ExtractedData, ImageAttachment, PendingImage, RepairOrder } from '@/types';
import { emptyExtractedData, mergeExtracted, normalizeExtractedData } from '@/utils/diagnosticParser';
import { normalizeScanFiles } from '@/utils/scanFileHelpers';
import { uploadFilesAsAttachments } from '@/utils/uploadHelpers';

export type XentryTarget =
  | { scope: 'line'; lineId: string }
  | { scope: 'ro'; roId: string };

function targetKey(target: XentryTarget): string {
  return target.scope === 'line' ? `line:${target.lineId}` : `ro:${target.roId}`;
}

interface UseROXentryScanOptions {
  roRef: MutableRefObject<RepairOrder | null>;
  flushPendingSave: () => Promise<void>;
  saveROImmediate: (
    ro: RepairOrder | null,
    options?: { throwOnError?: boolean }
  ) => Promise<void>;
  xentryInFlightRef: MutableRefObject<boolean>;
  onOcrStart: (message?: string) => void;
  onOcrFinish: () => void;
  setOcrProgress: (p: number) => void;
  setScanStatusMessage: (message: string) => void;
}

function applyXentrySnapshot(
  ro: RepairOrder,
  target: XentryTarget,
  images: ImageAttachment[],
  ocrTexts: string[],
  extracted: ExtractedData
): RepairOrder {
  if (target.scope === 'line') {
    return {
      ...ro,
      repairLines: ro.repairLines.map((line) =>
        line.id === target.lineId
          ? { ...line, xentryImages: images, xentryOcrTexts: ocrTexts, extractedData: extracted }
          : line
      ),
    };
  }

  const line0 = ro.repairLines[0];
  let repairLines = ro.repairLines;
  if (line0) {
    repairLines = ro.repairLines.map((line, idx) =>
      idx === 0
        ? {
            ...line,
            xentryImages: images,
            xentryOcrTexts: ocrTexts,
            extractedData: extracted,
          }
        : line
    );
  }

  return {
    ...ro,
    xentryImages: images,
    xentryOcrTexts: ocrTexts,
    repairLines,
  };
}

function readXentryBaseline(ro: RepairOrder, target: XentryTarget): {
  images: ImageAttachment[];
  ocrTexts: string[];
  extracted: ExtractedData;
} {
  if (target.scope === 'line') {
    const line = ro.repairLines.find((l) => l.id === target.lineId);
    return {
      images: line?.xentryImages || [],
      ocrTexts: line?.xentryOcrTexts || [],
      extracted: normalizeExtractedData(line?.extractedData || emptyExtractedData()),
    };
  }

  const line0 = ro.repairLines[0];
  return {
    images: ro.xentryImages || [],
    ocrTexts: ro.xentryOcrTexts || [],
    extracted: normalizeExtractedData(line0?.extractedData || emptyExtractedData()),
  };
}

/** Queue-and-process workflow for line / RO diagnostic (Xentry) photos — mirrors RO scan UX. */
export function useROXentryScan({
  roRef,
  flushPendingSave,
  saveROImmediate,
  xentryInFlightRef,
  onOcrStart,
  onOcrFinish,
  setOcrProgress,
  setScanStatusMessage,
}: UseROXentryScanOptions) {
  const [pendingByKey, setPendingByKey] = useState<Record<string, PendingImage[]>>({});
  const sessionRef = useRef(0);
  const cancelledRef = useRef(false);

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
    [pendingByKey]
  );

  const capturePhoto = useCallback(
    (target: XentryTarget) => {
      if (xentryInFlightRef.current) {
        toast.message('Diagnostic processing already in progress…');
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
    [appendPendingImages, xentryInFlightRef]
  );

  const addFromGallery = useCallback(
    (target: XentryTarget) => {
      if (xentryInFlightRef.current) {
        toast.message('Diagnostic processing already in progress…');
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
    [appendPendingImages, xentryInFlightRef]
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
    xentryInFlightRef.current = false;
    onOcrFinish();
    toast.message('Diagnostic processing cancelled');
  }, [onOcrFinish, xentryInFlightRef]);

  const toastProcessResult = useCallback((fileCount: number, ocrTexts: string[]) => {
    const failed = ocrTexts.filter((text) => text.includes('[Analysis failed:')).length;
    if (failed === fileCount) {
      const detail =
        ocrTexts
          .find((text) => text.includes('[Analysis failed:'))
          ?.match(/\[Analysis failed: (.+)\]/)?.[1] || 'Diagnostic analysis failed.';
      toast.error(detail);
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

      const snapshot = [...pending];
      const sessionId = ++sessionRef.current;
      const isActive = () => sessionRef.current === sessionId && !cancelledRef.current;

      cancelledRef.current = false;
      xentryInFlightRef.current = true;

      try {
        await flushPendingSave();
        if (!isActive()) return;

        const ro = roRef.current;
        if (!ro) {
          throw new Error('Repair order not loaded — go back and reopen the line.');
        }

        const baseline = readXentryBaseline(ro, target);
        const files = snapshot.map((img) => img.file);

        onOcrStart('Uploading diagnostic photos…');
        setOcrProgress(8);
        setScanStatusMessage(`Uploading ${files.length} diagnostic photo${files.length === 1 ? '' : 's'}…`);

        const newAttachments = await uploadFilesAsAttachments(files, 'ximg');
        if (!isActive()) return;

        const allImages = [...baseline.images, ...newAttachments];
        let updatedOcrTexts = [
          ...baseline.ocrTexts,
          ...files.map(() => '[Analyzing diagnostic photo…]'),
        ];
        let updatedExtracted = baseline.extracted;

        const withPlaceholders = applyXentrySnapshot(
          ro,
          target,
          allImages,
          updatedOcrTexts,
          updatedExtracted
        );
        roRef.current = withPlaceholders;
        await saveROImmediate(withPlaceholders, { throwOnError: true });
        if (!isActive()) return;

        setOcrProgress(18);
        setScanStatusMessage('Photos saved — running AI vision extraction…');
        void warmupOcrWorker().catch((error) => {
          clientLog.warn('xentry.ocr_warmup_failed', error);
        });

        for (let i = 0; i < files.length; i++) {
          if (!isActive()) return;

          const file = files[i]!;
          const attachment = newAttachments[i]!;
          const ocrIndex = baseline.ocrTexts.length + i;

          setScanStatusMessage(
            `Analyzing photo ${i + 1} of ${files.length} (fault codes, measurements, guided tests)…`
          );

          try {
            const result = await analyzeXentryImage(file, attachment, (p) => {
              if (!isActive()) return;
              const slice = 18 + ((i + p / 100) / files.length) * 78;
              setOcrProgress(Math.round(slice));
            });
            updatedExtracted = mergeExtracted(updatedExtracted, result.extracted);
            updatedOcrTexts = updatedOcrTexts.map((text, idx) =>
              idx === ocrIndex ? result.text : text
            );
          } catch (err) {
            clientLog.warn('xentry.analysis_failed', err);
            updatedOcrTexts = updatedOcrTexts.map((text, idx) =>
              idx === ocrIndex ? '[Analysis failed for this image]' : text
            );
          }

          const progressRo = roRef.current;
          if (progressRo) {
            const interim = applyXentrySnapshot(
              progressRo,
              target,
              allImages,
              updatedOcrTexts,
              updatedExtracted
            );
            roRef.current = interim;
            await saveROImmediate(interim, { throwOnError: true });
          }
        }

        if (!isActive()) return;

        setOcrProgress(100);
        setScanStatusMessage('Diagnostic extraction complete');

        clearPendingPreviews(snapshot);
        setPendingByKey((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });

        toastProcessResult(files.length, updatedOcrTexts.slice(baseline.ocrTexts.length));
      } catch (error) {
        if (!isActive()) return;
        clientLog.error('xentry.process_failed', error);
        toast.error(error instanceof Error ? error.message : 'Failed to process diagnostic photos');
      } finally {
        if (sessionRef.current === sessionId) {
          xentryInFlightRef.current = false;
          onOcrFinish();
        }
      }
    },
    [
      clearPendingPreviews,
      flushPendingSave,
      onOcrFinish,
      onOcrStart,
      pendingByKey,
      roRef,
      saveROImmediate,
      setOcrProgress,
      setScanStatusMessage,
      toastProcessResult,
      xentryInFlightRef,
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