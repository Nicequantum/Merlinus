'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLog';
import { sanitizeForCDKWithMeta } from '@/lib/sanitizeForCDK';
import type {
  AppView,
  RepairLine,
  RepairOrder,
  RepairOrderSummary,
  StoryQualityResult,
  StoryReviewResult,
  TechnicianSession,
} from '@/types';


import { useROComplaints } from '@/hooks/repairOrders/useROComplaints';
import { useROList } from '@/hooks/repairOrders/useROList';
import { useROPersistence } from '@/hooks/repairOrders/useROPersistence';
import { useROScan } from '@/hooks/repairOrders/useROScan';
import { useROSearch } from '@/hooks/repairOrders/useROSearch';
import {
  useROStoryWorkflow,
  type StoryCertificationRecord,
} from '@/hooks/repairOrders/useROStoryWorkflow';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import { hydrateStoryWorkflowFromRO } from '@/lib/storyCertificationClient';
import { hydrateStoryQualityFromRO } from '@/lib/storyQualityHydration';
import {
  createManualRepairOrder,
  createNewRepairLine,
  ensureComplaintIds,
} from '@/utils/repairOrderFactory';
import { repairOrderToSummary } from '@/utils/repairOrderSummary';
import { deriveCurrentLineStoryState } from '@/hooks/repairOrders/currentLineStoryState';
import { removeImageAtIndex } from '@/hooks/repairOrders/roImageUtils';
import { useROXentryScan, type XentryTarget } from '@/hooks/repairOrders/useROXentryScan';
import { isStoryCertificationPendingForLine } from '@/hooks/repairOrders/storyCertificationPending';
import { resetStoryWorkflowUiState } from '@/hooks/repairOrders/storyWorkflowUiReset';

interface UseRepairOrdersOptions {
  session: TechnicianSession | null;
  onOcrStart: (message?: string) => void;
  onOcrFinish: () => void;
  setOcrProgress: (p: number) => void;
  setScanStatusMessage: (message: string) => void;
  onComplianceRequired?: () => void;
}

export function useRepairOrders({
  session,
  onOcrStart,
  onOcrFinish,
  setOcrProgress,
  setScanStatusMessage,
  onComplianceRequired,
}: UseRepairOrdersOptions) {
  const [view, setView] = useState<AppView>('home');
  const [currentRO, setCurrentRO] = useState<RepairOrder | null>(null);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingLineId, setGeneratingLineId] = useState<string | null>(null);
  const [lastGeneratedStoryByLine, setLastGeneratedStoryByLine] = useState<Record<string, string>>({});
  const [cdkSanitizedByLine, setCdkSanitizedByLine] = useState<Record<string, boolean>>({});
  const [storyQualityByLine, setStoryQualityByLine] = useState<Record<string, StoryQualityResult>>({});
  const [storyReviewByLine, setStoryReviewByLine] = useState<Record<string, StoryReviewResult>>({});
  const [storyCertificationByLine, setStoryCertificationByLine] = useState<
    Record<string, StoryCertificationRecord>
  >({});
  const [isCertifyingStory, setIsCertifyingStory] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringLineId, setScoringLineId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewingLineId, setReviewingLineId] = useState<string | null>(null);
  const [openingROId, setOpeningROId] = useState<string | null>(null);
  const roRef = useRef<RepairOrder | null>(null);
  const openingROInFlightRef = useRef<string | null>(null);
  const scanInFlightRef = useRef(false);
  const xentryInFlightRef = useRef(false);
  const generateStorySeqRef = useRef(0);
  const storyGenerationInFlightRef = useRef(false);
  const scoreStorySeqRef = useRef(0);
  const storyScoringInFlightRef = useRef(false);
  const reviewStorySeqRef = useRef(0);
  const storyReviewInFlightRef = useRef(false);

  useEffect(() => {
    // While a scan or diagnostic batch is finishing, roRef is updated optimistically.
    if (scanInFlightRef.current || xentryInFlightRef.current) return;
    roRef.current = currentRO;
  }, [currentRO]);

  const {
    allROs,
    setAllROs,
    loading,
    listError,
    listRetrying,
    retryListLoad,
    refreshList,
    setTodayStartIso,
    previousROs,
    previousExpanded,
    togglePreviousExpanded,
    previousLoading,
    previousLoadingMore,
    previousHasMore,
    loadMorePrevious,
    todayROs,
  } = useROList(session, { onComplianceRequired });

  const { flushPendingSave, cancelPendingSave, applyROUpdate, saveROImmediate, persistRO } =
    useROPersistence(allROs, setAllROs, roRef, setCurrentRO);

  const xentryScan = useROXentryScan({
    roRef,
    flushPendingSave,
    saveROImmediate,
    xentryInFlightRef,
    onOcrStart,
    onOcrFinish,
    setOcrProgress,
    setScanStatusMessage,
  });

  const prepareForScan = useCallback(async () => {
    await flushPendingSave();
    cancelPendingSave();
  }, [cancelPendingSave, flushPendingSave]);

  const openScanResultView = useCallback(
    (repairOrder: RepairOrder) => {
      const normalized = ensureComplaintIds(repairOrder);
      flushSync(() => {
        roRef.current = normalized;
        setAllROs((prev) => [
          repairOrderToSummary(normalized),
          ...prev.filter((r) => r.id !== normalized.id),
        ]);
        setCurrentLineId(null);
        setCurrentRO(normalized);
        setView('ro');
      });
    },
    [setAllROs]
  );

  const navigateView = useCallback(
    (next: AppView) => {
      flushPendingSave();
      if (next === 'home') {
        roRef.current = null;
        setCurrentRO(null);
        setCurrentLineId(null);
      }
      setView(next);
    },
    [flushPendingSave]
  );

  const { searchTerm, setSearchTerm, searchLoading, searchROs } = useROSearch({
    session,
    allROs,
    setAllROs,
    setTodayStartIso,
  });

  const {
    pendingROImages,
    setPendingROImages,
    scanRO,
    addScanPagesFromGallery,
    processPendingScan,
    clearPendingScan,
    cancelScan,
  } = useROScan({
    prepareForScan,
    openScanResultView,
    scanInFlightRef,
    onOcrStart,
    onOcrFinish,
    setOcrProgress,
    setScanStatusMessage,
  });

  const { addComplaint, removeComplaint, editComplaint, updateRONumber } = useROComplaints({
    roRef,
    applyROUpdate,
  });

  /** Prevent blank screen when view points at RO/line but selection was cleared mid-scan. */
  useEffect(() => {
    if (scanInFlightRef.current) return;
    if (view === 'ro' && !currentRO) {
      setView('home');
      return;
    }
    if (view === 'line') {
      const lineExists =
        !!currentRO && !!currentLineId && currentRO.repairLines.some((line) => line.id === currentLineId);
      if (!lineExists) {
        setView(currentRO ? 'ro' : 'home');
      }
    }
  }, [view, currentRO, currentLineId]);

  const deleteRO = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this RO and all its data?')) return;
      try {
        await api.deleteRepairOrder(id);
        setAllROs((prev) => prev.filter((r) => r.id !== id));
        if (currentRO?.id === id) {
          setCurrentRO(null);
          setCurrentLineId(null);
          setLastGeneratedStoryByLine({});
          setStoryQualityByLine({});
          setStoryReviewByLine({});
          resetStoryWorkflowUiState(
            {
              generateStorySeqRef,
              scoreStorySeqRef,
              reviewStorySeqRef,
              storyGenerationInFlightRef,
              storyScoringInFlightRef,
              storyReviewInFlightRef,
            },
            {
              setIsGenerating,
              setGeneratingLineId,
              setIsScoring,
              setScoringLineId,
              setIsReviewing,
              setReviewingLineId,
            }
          );
          setView('home');
        }
        toast.success('Repair order deleted');
      } catch (e) {
        clientLog.error('ro.delete_failed', e);
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    },
    [currentRO]
  );

  const openROById = useCallback(
    async (id: string) => {
      if (openingROInFlightRef.current === id) return;
      openingROInFlightRef.current = id;
      setOpeningROId(id);
      flushPendingSave();
      try {
        const { repairOrder } = await api.getRepairOrder(id);
        const normalized = ensureComplaintIds(repairOrder);
        roRef.current = normalized;
        setCurrentRO(normalized);
        setCurrentLineId(null);
        const { qualityByLine, reviewByLine } = hydrateStoryQualityFromRO(normalized);
        const { certificationByLine, lastGeneratedByLine } = hydrateStoryWorkflowFromRO(normalized);
        setLastGeneratedStoryByLine(lastGeneratedByLine);
        setStoryCertificationByLine(certificationByLine);
        setStoryQualityByLine(qualityByLine);
        setStoryReviewByLine(reviewByLine);
        resetStoryWorkflowUiState(
          {
            generateStorySeqRef,
            scoreStorySeqRef,
            reviewStorySeqRef,
            storyGenerationInFlightRef,
            storyScoringInFlightRef,
            storyReviewInFlightRef,
          },
          {
            setIsGenerating,
            setGeneratingLineId,
            setIsScoring,
            setScoringLineId,
            setIsReviewing,
            setReviewingLineId,
          }
        );
        setAllROs((prev) => {
          const summary = repairOrderToSummary(normalized);
          const idx = prev.findIndex((r) => r.id === normalized.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = summary;
            return copy;
          }
          return [summary, ...prev];
        });
        navigateView('ro');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load repair order');
      } finally {
        if (openingROInFlightRef.current === id) {
          openingROInFlightRef.current = null;
        }
        setOpeningROId((current) => (current === id ? null : current));
      }
    },
    [flushPendingSave, navigateView]
  );

  const openRO = useCallback(
    (target: RepairOrder | RepairOrderSummary | string) => {
      const id = typeof target === 'string' ? target : target.id;
      void openROById(id);
    },
    [openROById]
  );

  const createManualRO = useCallback(async () => {
    try {
      const draft = createManualRepairOrder();
      const { repairOrder } = await api.createRepairOrder(draft);
      const withIds = ensureComplaintIds(
        draft.complaintIds && draft.complaintIds.length === repairOrder.complaints.length
          ? { ...repairOrder, complaintIds: draft.complaintIds }
          : repairOrder
      );
      roRef.current = withIds;
      setAllROs((prev) => [repairOrderToSummary(withIds), ...prev]);
      setCurrentRO(withIds);
      navigateView('ro');
      toast.success('Manual repair order created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create repair order');
    }
  }, [navigateView]);

  const isStoryCertificationPending = useCallback(
    (lineId: string, line?: RepairLine): boolean => {
      const targetLine = line ?? roRef.current?.repairLines.find((l) => l.id === lineId);
      return isStoryCertificationPendingForLine(
        lineId,
        targetLine,
        lastGeneratedStoryByLine,
        storyQualityByLine,
        storyCertificationByLine
      );
    },
    [lastGeneratedStoryByLine, roRef, storyCertificationByLine, storyQualityByLine]
  );

  const updateLine = useCallback(
    (lineId: string, updates: Partial<RepairLine>) => {
      let nextUpdates = updates;
      if (updates.warrantyStory !== undefined) {
        const { text, wasModified } = sanitizeForCDKWithMeta(updates.warrantyStory);
        nextUpdates = { ...updates, warrantyStory: text };
        if (wasModified) {
          setCdkSanitizedByLine((prev) => ({ ...prev, [lineId]: true }));
        }
      }

      const skipPersist =
        updates.warrantyStory !== undefined && isStoryCertificationPending(lineId);

      applyROUpdate(
        (ro) => ({
          ...ro,
          repairLines: ro.repairLines.map((line) =>
            line.id === lineId ? { ...line, ...nextUpdates } : line
          ),
        }),
        skipPersist ? { skipPersist: true } : undefined
      );
    },
    [applyROUpdate, isStoryCertificationPending]
  );

  const updateVehicle = useCallback(
    (updates: Partial<RepairOrder['vehicle']>) => {
      const normalized = { ...updates };
      if (normalized.vin !== undefined) normalized.vin = normalized.vin.toUpperCase();
      applyROUpdate((ro) => ({ ...ro, vehicle: { ...ro.vehicle, ...normalized } }));
    },
    [applyROUpdate]
  );

  const updateCustomer = useCallback(
    (name: string) => {
      applyROUpdate((ro) => ({ ...ro, customer: { ...ro.customer, name } }));
    },
    [applyROUpdate]
  );

  const decodeVinForRO = useCallback(async () => {
    flushPendingSave();
    const latestRO = roRef.current;
    if (!latestRO?.vehicle.vin || latestRO.vehicle.vin.length < 17) {
      toast.error('Enter a valid 17-character VIN first');
      return;
    }
    try {
      const result = await api.decodeVin(latestRO.vehicle.vin);
      if (!result.valid) {
        toast.error('VIN could not be decoded — verify and try again');
        return;
      }
      updateVehicle({
        year: result.year || latestRO.vehicle.year,
        make: result.make || latestRO.vehicle.make,
        model: result.model || latestRO.vehicle.model,
        engine: result.engine || latestRO.vehicle.engine,
      });
      toast.success('Vehicle details filled from NHTSA VIN decode');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'VIN decode failed');
    }
  }, [flushPendingSave, updateVehicle]);

  const addRepairLine = useCallback(async () => {
    flushPendingSave();
    const latestRO = roRef.current;
    if (!latestRO) return;
    const newLine = createNewRepairLine(latestRO.repairLines.length + 1);
    const updated = { ...latestRO, repairLines: [...latestRO.repairLines, newLine] };
    const saved = ensureComplaintIds(await persistRO(updated));
    roRef.current = saved;
    setCurrentRO(saved);
    setAllROs((prev) =>
      prev.map((r) => (r.id === saved.id ? repairOrderToSummary(saved) : r))
    );
    setCurrentLineId(saved.repairLines[saved.repairLines.length - 1].id);
    navigateView('line');
  }, [flushPendingSave, navigateView, persistRO]);

  const deleteLineXentryImage = useCallback(
    async (lineId: string, imageId: string) => {
      if (!window.confirm('Delete this diagnostic photo? Extracted data will be updated.')) return;
      const latestRO = roRef.current;
      if (!latestRO) return;
      const line = latestRO.repairLines.find((l) => l.id === lineId);
      if (!line) return;

      const result = removeImageAtIndex(line.xentryImages || [], line.xentryOcrTexts || [], imageId);
      if (!result) return;

      const updatedLines = latestRO.repairLines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              xentryImages: result.nextImages,
              xentryOcrTexts: result.nextOcr,
              extractedData: result.rebuilt,
            }
          : l
      );
      try {
        await saveROImmediate({ ...latestRO, repairLines: updatedLines });
        toast.success('Diagnostic photo deleted');
      } catch (error: unknown) {
        clientLog.error('ro.delete_diagnostic_photo_failed', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete diagnostic photo');
      }
    },
    [saveROImmediate]
  );

  const deleteROXentryImage = useCallback(
    async (imageId: string) => {
      if (!window.confirm('Delete this Xentry photo? Extracted data will be updated.')) return;
      const latestRO = roRef.current;
      if (!latestRO) return;

      const result = removeImageAtIndex(latestRO.xentryImages || [], latestRO.xentryOcrTexts || [], imageId);
      if (!result) return;

      const updatedLines = latestRO.repairLines.map((l, idx) => {
        if (idx !== 0) return l;
        const lineImages = l.xentryImages || [];
        if (!lineImages.some((img) => img.id === imageId)) return l;
        const lineResult = removeImageAtIndex(lineImages, l.xentryOcrTexts || [], imageId);
        if (!lineResult) return l;
        return {
          ...l,
          xentryImages: lineResult.nextImages,
          xentryOcrTexts: lineResult.nextOcr,
          extractedData: lineResult.rebuilt,
        };
      });

      try {
        await saveROImmediate({
          ...latestRO,
          xentryImages: result.nextImages,
          xentryOcrTexts: result.nextOcr,
          repairLines: updatedLines,
        });
        toast.success('Xentry photo deleted');
      } catch (error: unknown) {
        clientLog.error('ro.delete_xentry_photo_failed', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete Xentry photo');
      }
    },
    [saveROImmediate]
  );

  const buildXentrySection = useCallback(
    (target: XentryTarget) => {
      const line =
        target.scope === 'line'
          ? currentRO?.repairLines.find((l) => l.id === target.lineId)
          : currentRO?.repairLines[0];

      return {
        savedImages:
          target.scope === 'line' ? line?.xentryImages ?? [] : currentRO?.xentryImages ?? [],
        pendingImages: xentryScan.getPendingImages(target),
        extractedData: line?.extractedData,
        onCapturePhoto: () => xentryScan.capturePhoto(target),
        onAddFromGallery: () => xentryScan.addFromGallery(target),
        onProcessImages: () => void xentryScan.processPending(target),
        onClearPending: () => xentryScan.clearPending(target),
        onCancelProcessing: () => xentryScan.cancelProcessing(),
        onDeleteSavedImage:
          target.scope === 'line'
            ? (imageId: string) => void deleteLineXentryImage(target.lineId, imageId)
            : (imageId: string) => void deleteROXentryImage(imageId),
      };
    },
    [currentRO, deleteLineXentryImage, deleteROXentryImage, xentryScan]
  );

  const invalidateReviewRequests = useCallback(() => {
    reviewStorySeqRef.current += 1;
    storyReviewInFlightRef.current = false;
    setIsReviewing(false);
    setReviewingLineId(null);
  }, []);

  const invalidateScoreRequests = useCallback(() => {
    scoreStorySeqRef.current += 1;
    storyScoringInFlightRef.current = false;
    setIsScoring(false);
    setScoringLineId(null);
  }, []);

  const clearLineQualityState = useCallback(
    (lineId: string) => {
      setStoryQualityByLine((prev) => {
        if (!prev[lineId]) return prev;
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      setStoryReviewByLine((prev) => {
        if (!prev[lineId]) return prev;
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      applyROUpdate(
        (ro) => ({
          ...ro,
          repairLines: ro.repairLines.map((line) =>
            line.id === lineId
              ? { ...line, storyQualityAudit: null, clearStoryQualityAudit: true }
              : line
          ),
        }),
        { immediate: true }
      );
    },
    [applyROUpdate]
  );

  const clearLineCertification = useCallback((lineId: string) => {
    setStoryCertificationByLine((prev) => {
      if (!prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }, []);

  const { applyCustomerPayTemplate, clearCustomerPayMode, generateStory, scoreStory, reviewStory } =
    useROStoryWorkflow(
      {
        roRef,
        generateStorySeqRef,
        scoreStorySeqRef,
        reviewStorySeqRef,
        storyGenerationInFlightRef,
        storyScoringInFlightRef,
        storyReviewInFlightRef,
      },
      {
        setIsGenerating,
        setGeneratingLineId,
        setIsScoring,
        setScoringLineId,
        setIsReviewing,
        setReviewingLineId,
        setLastGeneratedStoryByLine,
        setStoryQualityByLine,
        setStoryReviewByLine,
        setCdkSanitizedByLine,
        setStoryCertificationByLine,
      },
      {
        flushPendingSave,
        applyROUpdate,
        clearLineQualityState,
        clearLineCertification,
        invalidateReviewRequests,
        invalidateScoreRequests,
      }
    );

  const certifyAndSaveStory = useCallback(
    async (lineId: string, warrantyStory: string, certifiedByName: string) => {
      await flushPendingSave();
      const latestRO = roRef.current;
      if (!latestRO) {
        toast.error('Repair order not loaded — go back and reopen the line');
        return;
      }

      const line = latestRO.repairLines.find((l) => l.id === lineId);
      if (!line) {
        toast.error('Repair line not found — refresh the RO and try again');
        return;
      }
      if (isCustomerPayRepairLine(line)) {
        toast.error('Customer Pay stories do not require certification');
        return;
      }

      setIsCertifyingStory(true);
      try {
        const result = await api.certifyStory(
          latestRO.id,
          lineId,
          warrantyStory,
          certifiedByName.trim()
        );
        const certifiedStory = result.warrantyStory.trim();
        setStoryCertificationByLine((prev) => ({
          ...prev,
          [lineId]: {
            certifiedByName: result.certifiedByName,
            certifiedAt: result.certifiedAt,
            storyText: certifiedStory,
          },
        }));
        applyROUpdate(
          (ro) => ({
            ...ro,
            repairLines: ro.repairLines.map((l) =>
              l.id === lineId
                ? {
                    ...l,
                    warrantyStory: result.warrantyStory,
                    storyCertification: {
                      certifiedByName: result.certifiedByName,
                      certifiedAt: result.certifiedAt,
                      storyHash: result.storyHash ?? '',
                      certifiedByTechnicianId: session?.technicianId ?? '',
                    },
                  }
                : l
            ),
          }),
          { immediate: true }
        );
        toast.success('Story certified and saved');
      } catch (error: unknown) {
        throw error instanceof Error ? error : new Error('Failed to certify and save story');
      } finally {
        setIsCertifyingStory(false);
      }
    },
    [applyROUpdate, flushPendingSave, roRef]
  );

  const acknowledgeStoryBaseline = useCallback((lineId: string, text: string) => {
    setLastGeneratedStoryByLine((prev) => ({ ...prev, [lineId]: text }));
  }, []);

  const clearCdkSanitizedNotice = useCallback((lineId: string) => {
    setCdkSanitizedByLine((prev) => {
      if (!prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }, []);

  const {
    currentLine,
    lastGeneratedStoryForLine,
    cdkSanitizedForLine,
    isGeneratingForLine,
    isScoringForLine,
    isReviewingForLine,
    storyQualityForLine,
    storyReviewForLine,
    storyQualityStaleForLine,
    storyCertificationForLine,
  } = deriveCurrentLineStoryState({
    currentRO,
    currentLineId,
    isGenerating,
    generatingLineId,
    isScoring,
    scoringLineId,
    isReviewing,
    reviewingLineId,
    storyQualityByLine,
    storyReviewByLine,
    storyCertificationByLine,
    lastGeneratedStoryByLine,
    cdkSanitizedByLine,
  });

  /** @deprecated Use todayROs / searchROs — kept for any legacy callers. */
  const filteredROs = searchTerm.trim() ? searchROs : todayROs;

  const navigateToLine = useCallback(
    (lineId: string) => {
      flushPendingSave();
      setCurrentLineId(lineId);
      navigateView('line');
    },
    [flushPendingSave, navigateView]
  );

  return {
    view,
    setView: navigateView,
    currentRO,
    setCurrentRO,
    currentLineId,
    setCurrentLineId,
    currentLine,
    allROs,
    loading,
    listError,
    listRetrying,
    retryListLoad,
    refreshList,
    searchTerm,
    setSearchTerm,
    pendingROImages,
    setPendingROImages,
    isGenerating,
    isGeneratingForLine,
    isScoringForLine,
    isReviewingForLine,
    storyQualityForLine,
    storyReviewForLine,
    storyQualityStaleForLine,
    storyCertificationForLine,
    isCertifyingStory,
    lastGeneratedStoryForLine,
    cdkSanitizedForLine,
    clearCdkSanitizedNotice,
    openingROId,
    filteredROs,
    todayROs,
    searchROs,
    searchLoading,
    previousROs,
    previousExpanded,
    togglePreviousExpanded,
    previousLoading,
    previousLoadingMore,
    previousHasMore,
    loadMorePrevious,
    flushPendingSave,
    navigateToLine,
    deleteRO,
    openRO,
    openROById,
    scanRO,
    addScanPagesFromGallery,
    processPendingScan,
    clearPendingScan,
    cancelScan,
    createManualRO,
    updateLine,
    updateVehicle,
    updateCustomer,
    addComplaint,
    removeComplaint,
    editComplaint,
    updateRONumber,
    decodeVinForRO,
    addRepairLine,
    buildXentrySection,
    deleteLineXentryImage,
    deleteROXentryImage,
    applyCustomerPayTemplate,
    clearCustomerPayMode,
    generateStory,
    scoreStory,
    reviewStory,
    certifyAndSaveStory,
    acknowledgeStoryBaseline,
  };
}