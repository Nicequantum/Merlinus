'use client';

import { useEffect, useRef } from 'react';
import { subscribeCompanionVoice } from '@/lib/companionVoiceBridge';
import { useCompanionSync } from '@/hooks/useCompanionSync';
import type { useOcrProgress } from '@/hooks/useOcrProgress';
import type { useRepairOrders } from '@/hooks/useRepairOrders';
import {
  companionRolePublishes,
  type CompanionSyncRole,
} from '@/lib/companionSyncRole';
import type { TechnicianSession } from '@/types';

type RepairOrdersApi = ReturnType<typeof useRepairOrders>;
type OcrApi = ReturnType<typeof useOcrProgress>;

interface CompanionSyncBridgeProps {
  session: TechnicianSession;
  enabled: boolean;
  role: CompanionSyncRole;
  ro: RepairOrdersApi;
  ocr: OcrApi;
  children: (companion: ReturnType<typeof useCompanionSync>) => React.ReactNode;
}

/** Wires SSE companion sync to repair-order state without changing tablet UI. */
export function CompanionSyncBridge({ session, enabled, role, ro, ocr, children }: CompanionSyncBridgeProps) {
  const roRef = useRef(ro);
  roRef.current = ro;
  const autoPublish = companionRolePublishes(role);

  const ensureCompanionLineContext = async (repairOrderId: string, lineId?: string | null) => {
    await roRef.current.ensureRepairOrderOpen(repairOrderId);
    const api = roRef.current;
    if (lineId && (api.view !== 'line' || api.currentLineId !== lineId)) {
      await api.navigateToLine(lineId);
    }
  };

  const companion = useCompanionSync({
    enabled,
    role,
    onNavigation: async ({ view, repairOrderId, lineId }) => {
      const api = roRef.current;
      if (view === 'home') {
        api.setView('home');
        return;
      }
      if (!repairOrderId) return;
      await api.ensureRepairOrderOpen(repairOrderId);
      if (view === 'line' && lineId) {
        await api.navigateToLine(lineId);
      } else if (view === 'ro') {
        api.setView('ro');
      }
    },
    onRORefresh: async (repairOrderId) => {
      await roRef.current.ensureRepairOrderOpen(repairOrderId);
    },
    onROPatch: async (payload) => {
      await roRef.current.ensureRepairOrderOpen(payload.repairOrderId);
      roRef.current.mergeCompanionPatch(payload);
    },
    onStoryQuality: async ({ repairOrderId, lineId, quality }) => {
      await ensureCompanionLineContext(repairOrderId, lineId);
      roRef.current.applyCompanionStoryQuality(lineId, quality);
    },
    onStoryCertification: async ({
      repairOrderId,
      lineId,
      certifiedByName,
      certifiedAt,
      warrantyStory,
      storyHash,
    }) => {
      await ensureCompanionLineContext(repairOrderId, lineId);
      roRef.current.applyCompanionCertification(lineId, {
        certifiedByName,
        certifiedAt,
        warrantyStory,
        storyHash,
      });
    },
  });

  const { publishNavigation, publishStatus } = companion;

  useEffect(() => {
    if (!enabled || !autoPublish) return;
    publishNavigation({
      view: ro.view,
      repairOrderId: ro.currentRO?.id ?? null,
      lineId: ro.currentLineId,
    });
  }, [autoPublish, enabled, publishNavigation, ro.view, ro.currentRO?.id, ro.currentLineId]);

  useEffect(() => {
    if (!enabled || !autoPublish) return;
    return subscribeCompanionVoice((listening) => {
      if (listening) {
        publishStatus('listening', {
          message: 'Listening to voice…',
          repairOrderId: roRef.current.currentRO?.id ?? null,
          lineId: roRef.current.currentLineId,
        });
      } else if (roRef.current.isGeneratingForLine || roRef.current.isScoringForLine) {
        return;
      } else {
        publishStatus('idle');
      }
    });
  }, [autoPublish, enabled, publishStatus]);

  useEffect(() => {
    if (!enabled || !autoPublish) return;
    const onLine = ro.view === 'line';
    const activePipeline = onLine ? ocr.xentry : ocr.roScan;
    if (activePipeline.isProcessing) {
      publishStatus(onLine ? 'processing_xentry' : 'scanning', {
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
      publishStatus('generating', {
        message: 'Generating warranty story…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isScoringForLine) {
      publishStatus('scoring', {
        message: 'Running MI Quality Audit…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isReviewingForLine) {
      publishStatus('reviewing', {
        message: 'AI review in progress…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    if (ro.isCertifyingStory) {
      publishStatus('certifying', {
        message: 'Certifying story…',
        repairOrderId: ro.currentRO?.id ?? null,
        lineId: ro.currentLineId,
      });
      return;
    }
    publishStatus('idle');
  }, [
    autoPublish,
    enabled,
    publishStatus,
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