'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { clientLog } from '@/lib/clientLog';
import { formatScanApiError, isStrongGrokExtraction } from '@/lib/scanPipeline';
import { runFastRoScanOcr, warmupOcrWorker } from '@/services/ocr';
import type { PendingImage, RepairOrder } from '@/types';
import {
  extractCustomerName,
  extractRoNumberFromText,
  finalizeLabeledComplaints,
  mergeMultiPassOcrExtractions,
  mergeROExtractions,
  mergeScanSources,
  parseStructuredROText,
  sanitizeComplaints,
  sanitizeVehicle,
} from '@/utils/roExtractor';
import type { StructuredROExtraction } from '@/types';
import { normalizeScanFiles } from '@/utils/scanFileHelpers';
import {
  classifyScanPages,
  combineRepairOrderPages,
  combineVmiPages,
} from '@/utils/scanDocumentClassifier';
import { extractVmiWarrantyInfo, mergeVehicleWarrantyInfo } from '@/utils/vmiExtractor';
import { uploadRoScanAttachments } from '@/utils/uploadHelpers';
import { ensureComplaintIds } from '@/utils/repairOrderFactory';

interface UseROScanOptions {
  /** Flush + cancel stale debounced saves before scan (prevents post-scan overwrite). */
  prepareForScan: () => Promise<void>;
  /** Open scanned RO without flushPendingSave — navigateView races with new RO state. */
  openScanResultView: (repairOrder: RepairOrder) => void;
  scanInFlightRef: MutableRefObject<boolean>;
  onOcrStart: (message?: string) => void;
  onOcrFinish: () => void;
  setOcrProgress: (p: number) => void;
  setScanStatusMessage: (message: string) => void;
}

/** RO document scan pipeline: pending pages, OCR, Grok extraction, and RO creation. */
export function useROScan({
  prepareForScan,
  openScanResultView,
  scanInFlightRef,
  onOcrStart,
  onOcrFinish,
  setOcrProgress,
  setScanStatusMessage,
}: UseROScanOptions) {
  const [pendingROImages, setPendingROImages] = useState<PendingImage[]>([]);
  const scanCancelledRef = useRef(false);
  const scanSessionRef = useRef(0);

  const clearPendingPreviews = useCallback((images: PendingImage[]) => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }, []);

  const createROFromExtracted = useCallback(
    async (extracted: {
      vehicle: RepairOrder['vehicle'];
      complaints: string[];
      complaintLabels?: string[];
      customerName: string;
      roNumber?: string;
      serviceAdvisorName?: string;
    }): Promise<boolean> => {
      try {
        const finalized = finalizeLabeledComplaints(
          extracted.complaints || [],
          extracted.complaintLabels
        );
        const complaints = finalized.complaints;
        const complaintLabels = finalized.labels;
        const { repairOrder } = await api.createRepairOrder({
          fromExtraction: true,
          roNumber: extracted.roNumber || `R-${Date.now().toString().slice(-6)}`,
          vehicle: sanitizeVehicle(extracted.vehicle),
          customerName: extracted.customerName,
          serviceAdvisorName: extracted.serviceAdvisorName,
          advisorExtractionSource: 'grok',
          complaints,
          complaintLabels,
        } as never);
        const normalized = ensureComplaintIds(repairOrder);
        openScanResultView(normalized);
        scanInFlightRef.current = false;
        toast.success('Repair order created from scan');
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
        return false;
      }
    },
    [openScanResultView, scanInFlightRef]
  );

  const createROFromText = useCallback(
    async (text: string) => {
      const parsed = parseStructuredROText(text);
      const roNumber = parsed.roNumber || extractRoNumberFromText(text);
      const vehicle = sanitizeVehicle(parsed.vehicle);
      const complaints = sanitizeComplaints(parsed.complaints);
      const custName = parsed.customerName || extractCustomerName(text);
      try {
        const { repairOrder } = await api.createRepairOrder({
          fromExtraction: true,
          roNumber,
          vehicle,
          customerName: custName,
          serviceAdvisorName: parsed.serviceAdvisorName,
          advisorExtractionSource: 'ocr_fallback',
          complaints,
          complaintLabels: parsed.complaintLabels,
        } as never);
        const normalized = ensureComplaintIds(repairOrder);
        openScanResultView(normalized);
        scanInFlightRef.current = false;
        toast.success('Repair order created from scan');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
      }
    },
    [openScanResultView, scanInFlightRef]
  );

  const mergePageOcrExtraction = useCallback(
    (
      accumulated: StructuredROExtraction | null,
      passExtractions: StructuredROExtraction[],
      passTexts: string[],
      pageMergedText: string
    ): StructuredROExtraction => {
      const pageMerged = mergeMultiPassOcrExtractions(passExtractions, passTexts);
      if (!accumulated) return pageMerged;
      return mergeROExtractions(accumulated, pageMerged, pageMergedText);
    },
    []
  );

  const processScanImages = useCallback(
    async (images: PendingImage[]) => {
      if (images.length === 0) return;
      if (scanInFlightRef.current) {
        toast.message('Scan already in progress…');
        return;
      }

      const sessionId = ++scanSessionRef.current;
      const isActiveSession = () =>
        scanSessionRef.current === sessionId && !scanCancelledRef.current;

      scanCancelledRef.current = false;
      scanInFlightRef.current = true;

      let createdSuccessfully = false;

      try {
        await prepareForScan();
        if (!isActiveSession()) return;

        onOcrStart('Uploading documents…');
        setPendingROImages(images);
        setOcrProgress(8);
        setScanStatusMessage(`Uploading ${images.length} page${images.length === 1 ? '' : 's'}…`);
        void warmupOcrWorker().catch((error) => {
          clientLog.warn('OCR worker warmup failed', error);
        });
        const attachments = await uploadRoScanAttachments(images.map((img) => img.file));
        if (!isActiveSession()) return;

        const imagePathnames = attachments.map((a) => a.pathname);

        type ClientOcrResult = {
          combinedText: string;
          structuredFromPasses: StructuredROExtraction | null;
        };

        const emptyOcrResult = (): ClientOcrResult => ({
          combinedText: '',
          structuredFromPasses: null,
        });

        const runClientOcr = async (): Promise<ClientOcrResult> => {
          let combinedText = '';
          let structuredFromPasses: StructuredROExtraction | null = null;

          for (let i = 0; i < images.length; i++) {
            if (!isActiveSession()) return emptyOcrResult();
            const img = images[i];
            setScanStatusMessage(`Reading page ${i + 1} of ${images.length} (on-device OCR)…`);
            setOcrProgress(Math.round(30 + (i / images.length) * 15));

            let ocrResult;
            try {
              ocrResult = await runFastRoScanOcr(img.file, (p) => {
                if (!isActiveSession()) return;
                setOcrProgress(Math.round(45 + (i / images.length) * 35 + (p / images.length) * 35));
              });
            } catch (error) {
              clientLog.warn(`On-device OCR failed on page ${i + 1}; continuing if AI vision succeeds`, error);
              continue;
            }

            const passExtractions = ocrResult.passes.map((pass) => parseStructuredROText(pass.text));
            const passTexts = ocrResult.passes.map((pass) => pass.text);
            structuredFromPasses = mergePageOcrExtraction(
              structuredFromPasses,
              passExtractions,
              passTexts,
              ocrResult.mergedText
            );
            combinedText += `\n\n=== PAGE ${i + 1} ===\n${ocrResult.mergedText}`;
          }

          return { combinedText, structuredFromPasses };
        };

        setOcrProgress(35);
        setScanStatusMessage('AI vision extraction started (on-device OCR runs as fallback)…');
        const ocrPromise = runClientOcr().catch((error) => {
          clientLog.error('ro.scan.ocr_failed', error);
          return emptyOcrResult();
        });

        let extractError: string | null = null;
        const grokPromise = api.extractRO(imagePathnames).catch((error) => {
          extractError = formatScanApiError(error);
          clientLog.error('ro.scan.extract_api_failed', {
            message: extractError,
            status: error instanceof ApiError ? error.status : undefined,
            pageCount: imagePathnames.length,
            pathnames: imagePathnames,
          });
          return null;
        });

        setOcrProgress(42);
        setScanStatusMessage('AI vision extraction in progress…');

        const grokExtracted = await grokPromise;
        if (!isActiveSession()) return;

        let ocrResult: ClientOcrResult;
        if (isStrongGrokExtraction(grokExtracted)) {
          setOcrProgress(78);
          setScanStatusMessage('AI vision complete — finalizing repair order…');
          ocrResult = emptyOcrResult();
          void ocrPromise;
        } else {
          setScanStatusMessage('AI vision inconclusive — finishing on-device OCR…');
          ocrResult = await ocrPromise;
        }
        if (!isActiveSession()) return;

        const ocrText = ocrResult.combinedText;
        const structuredFromPasses = ocrResult.structuredFromPasses;

        if (!ocrText?.trim() && !grokExtracted) {
          const detail =
            extractError ||
            'Could not read the repair order — no text from on-device OCR or AI vision.';
          throw new Error(detail);
        }

        if (!grokExtracted && extractError && ocrText?.trim()) {
          toast.warning(`On-device OCR used — AI vision unavailable: ${extractError}`);
        }

        setOcrProgress(82);
        setScanStatusMessage('Cross-validating AI vision and OCR results…');

        const classifiedPages = classifyScanPages(ocrText || '');
        const roOcrText =
          combineRepairOrderPages(classifiedPages) ||
          (classifiedPages.some((page) => page.kind === 'repair_order') ? '' : ocrText || '');
        const vmiOcrText = combineVmiPages(classifiedPages);
        const vmiWarranty = extractVmiWarrantyInfo(vmiOcrText);

        const ocrExtracted =
          structuredFromPasses ||
          (roOcrText ? parseStructuredROText(roOcrText) : null);
        let extracted = mergeScanSources(grokExtracted, ocrExtracted, roOcrText || ocrText || '');

        if (vmiWarranty && Object.keys(vmiWarranty).length > 0) {
          extracted = {
            ...extracted,
            vehicle: {
              ...extracted.vehicle,
              warrantyInfo: mergeVehicleWarrantyInfo(extracted.vehicle.warrantyInfo, vmiWarranty),
            },
          };
        }

        if (!isActiveSession()) return;
        setOcrProgress(88);
        setScanStatusMessage('Creating repair order…');
        createdSuccessfully = await createROFromExtracted(extracted);
        if (!createdSuccessfully) {
          throw new Error('Failed to create repair order from scan.');
        }

        setOcrProgress(100);
        setScanStatusMessage('Opening repair order…');
      } catch (error) {
        if (!isActiveSession()) return;
        const message = formatScanApiError(error);
        clientLog.error('ro.scan.failed', {
          message,
          status: error instanceof ApiError ? error.status : undefined,
          pageCount: images.length,
          rawError: error instanceof Error ? error.message : undefined,
        });
        toast.error(message);
        if (!createdSuccessfully) {
          setPendingROImages(images);
        } else {
          clearPendingPreviews(images);
          setPendingROImages([]);
        }
      } finally {
        if (scanSessionRef.current === sessionId) {
          if (createdSuccessfully) {
            clearPendingPreviews(images);
            setPendingROImages([]);
          } else {
            scanInFlightRef.current = false;
          }
          onOcrFinish();
        }
      }
    },
    [
      clearPendingPreviews,
      createROFromExtracted,
      mergePageOcrExtraction,
      onOcrFinish,
      onOcrStart,
      prepareForScan,
      setOcrProgress,
      setScanStatusMessage,
    ]
  );

  const appendScanPages = useCallback(
    async (rawFiles: File[]) => {
      if (rawFiles.length === 0) return;

      try {
        const normalizedFiles = await normalizeScanFiles(rawFiles);
        if (normalizedFiles.length === 0) {
          toast.error('No supported images or PDFs were selected.');
          return;
        }

        const baseIndex = pendingROImages.length;
        const newImages: PendingImage[] = normalizedFiles.map((file, i) => ({
          id: 'roimg-' + Date.now() + '-' + i,
          previewUrl: URL.createObjectURL(file),
          name: file.name || `page-${baseIndex + i + 1}.jpg`,
          file,
        }));

        setPendingROImages((prev) => [...prev, ...newImages]);
        const total = baseIndex + newImages.length;
        toast.success(
          `Added ${newImages.length} page${newImages.length === 1 ? '' : 's'} (${total} total). Tap Process RO when ready.`
        );
      } catch (error) {
        clientLog.error('Scan file preparation failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not prepare files for scan.');
      }
    },
    [pendingROImages.length]
  );

  const scanRO = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = false;
    input.onchange = async (e) => {
      const rawFiles = Array.from((e.target as HTMLInputElement).files || []);
      await appendScanPages(rawFiles);
    };
    input.click();
  }, [appendScanPages]);

  const addScanPagesFromGallery = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true;
    input.onchange = async (e) => {
      const rawFiles = Array.from((e.target as HTMLInputElement).files || []);
      await appendScanPages(rawFiles);
    };
    input.click();
  }, [appendScanPages]);

  const processPendingScan = useCallback(async () => {
    if (scanInFlightRef.current) {
      toast.message('Scan already in progress…');
      return;
    }
    if (pendingROImages.length === 0) {
      toast.message('Add at least one page before processing.');
      return;
    }
    const snapshot = [...pendingROImages];
    await processScanImages(snapshot);
  }, [pendingROImages, processScanImages]);

  const clearPendingScan = useCallback(() => {
    clearPendingPreviews(pendingROImages);
    setPendingROImages([]);
    toast.message('Scan pages cleared');
  }, [clearPendingPreviews, pendingROImages]);

  const cancelScan = useCallback(() => {
    scanSessionRef.current += 1;
    scanCancelledRef.current = true;
    scanInFlightRef.current = false;
    clearPendingPreviews(pendingROImages);
    setPendingROImages([]);
    onOcrFinish();
    toast.message('Scan cancelled');
  }, [clearPendingPreviews, onOcrFinish, pendingROImages]);

  return {
    pendingROImages,
    setPendingROImages,
    scanRO,
    addScanPagesFromGallery,
    processPendingScan,
    clearPendingScan,
    cancelScan,
    createROFromText,
  };
}