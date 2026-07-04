'use client';

import { useEffect, useRef } from 'react';
import { subscribeCompanionVoice } from '@/lib/companionVoiceBridge';
import { useCompanionSync } from '@/hooks/useCompanionSync';
import type { useOcrProgress } from '@/hooks/useOcrProgress';
import type { useRepairOrders } from '@/hooks/useRepairOrders';
import type { TechnicianSession } from '@/types';

type RepairOrdersApi = ReturnType<typeof useRepairOrders>;
type OcrApi = ReturnType<typeof useOcrProgress>;

interface CompanionSyncBridgeProps {
  session: TechnicianSession;
  enabled: boolean;
  ro: RepairOrdersApi;
  ocr: OcrApi;
  children: (companion: ReturnType<typeof useCompanionSync>) => React.ReactNode;
}

/** Wires SSE companion sync to repair-order state without changing tablet UI. */
export function CompanionSyncBridge({ session, enabled, ro, ocr, children }: CompanionSyncBridgeProps) {
  const roRef = useRef(ro);
  roRef.current = ro;

  const companion = useCompanionSync({
    enabled,
    onNavigation: async ({ view, repairOrderId, lineId }) => {
      const api = roRef.current;
      if (view === 'home') {
        api.setView('home');
        return;
      }
      if (!repairOrderId) return;
      if (api.currentRO?.id !== repairOrderId) {
        await api.openROById(repairOrderId);
      }
      if (view === 'line' && lineId) {
        api.navigateToLine(lineId);
      } else if (view === 'ro') {
        api.setView('ro');
      }
    },
    onRORefresh: async (repairOrderId) => {
      const api = roRef.current;
      if (api.currentRO?.id === repairOrderId) {
        await api.openROById(repairOrderId);
      }
    },
    onROPatch: (payload) => {
      roRef.current.mergeCompanionPatch(payload);
    },
    onStoryQuality: ({ lineId, quality }) => {
      roRef.current.applyCompanionStoryQuality(lineId, quality);
    },
    onStoryCertification: ({ lineId, certifiedByName, certifiedAt, warrantyStory }) => {
      roRef.current.applyCompanionCertification(lineId, {
        certifiedByName,
        certifiedAt,
        warrantyStory,
      });
    },
  });

  useEffect(() => {
    if (!enabled) return;
    companion.publishNavigation({
      view: ro.view,
      repairOrderId: ro.currentRO?.id ?? null,
      lineId: ro.currentLineId,
    });
  }, [companion, enabled, ro.view, ro.currentRO?.id, ro.currentLineId]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeCompanionVoice((listening) => {
      if (listening) {
        companion.publishStatus('listening', {
          message: 'Listening to voice…',
          repairOrderId: roRef.current.currentRO?.id ?? null,
          lineId: roRef.current.currentLineId,
        });
      } else if (roRef.current.isGeneratingForLine || roRef.current.isScoringForLine) {
        return;
      } else {
        companion.publishStatus('idle');
      }
    });
  }, [companion, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onLine = ro.view === 'line';
    const activePipeline = onLine ? ocr.xentry : ocr.roScan;
    if (activePipeline.isProcessing) {
      companion.publishStatus(onLine ? 'processing_xentry' : 'scanning', {
        message: onLine
          ? 'Processing Xentry photos…'
          : activePipeline.statusMessage || 'Scanning repair order…',
        progress: activePipeline.progress,
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: onLine ? ro.currentLineId : null,
      });
      return;
    }
    if (ro.isGeneratingForLine) {
      companion.publishStatus('generating', {
        message: 'Generating warranty story…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isScoringForLine) {
      companion.publishStatus('scoring', {
        message: 'Running MI quality audit…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isReviewingForLine) {
      companion.publishStatus('reviewing', {
        message: 'AI review in progress…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isCertifyingStory) {
      companion.publishStatus('certifying', {
        message: 'Certifying story…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    companion.publishStatus('idle');
  }, [
    companion,
    enabled,
    ocr.roScan.isProcessing,
    ocr.roScan.progress,
    ocr.roScan.statusMessage,
    ocr.xentry.isProcessing,
    ocr.xentry.progress,
    ocr.xentry.statusMessage,
    ro.currentLineId,
    ro.currentRO?.id,
    ro.isCertifyingStory,
    ro.isGeneratingForLine,
    ro.isReviewingForLine,
    ro.isScoringForLine,
    ro.view,
  ]);

  return <>{children(companion)}</>;
}