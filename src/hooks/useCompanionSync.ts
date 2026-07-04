'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { getCompanionDeviceId } from '@/lib/companionDeviceId';
import { COMPANION_DEVICE_HEADER } from '@/lib/companionPublish';
import type {
  CompanionActivityEntry,
  CompanionConnectionState,
  CompanionEvent,
  CompanionWorkflowStatus,
} from '@/lib/companionSyncTypes';
import type { AppView, RepairLine, StoryQualityResult } from '@/types';

const STREAM_URL = '/api/companion/stream';
const PUBLISH_URL = '/api/companion/publish';
const MAX_ACTIVITY = 40;
const RECONNECT_MS = 2_000;

export function companionRoKey(repairOrderId: string): string {
  return `/api/repair-orders/${repairOrderId}`;
}

interface CompanionHandlers {
  onNavigation: (payload: {
    view: AppView;
    repairOrderId: string | null;
    lineId: string | null;
  }) => void | Promise<void>;
  onRORefresh: (repairOrderId: string) => void | Promise<void>;
  onROPatch: (payload: {
    repairOrderId: string;
    lineId?: string;
    linePatch?: Partial<RepairLine>;
  }) => void;
  onStoryQuality: (payload: {
    repairOrderId: string;
    lineId: string;
    quality: StoryQualityResult;
  }) => void;
  onStoryCertification: (payload: {
    repairOrderId: string;
    lineId: string;
    certifiedByName: string;
    certifiedAt: string;
    warrantyStory: string;
    storyHash?: string;
  }) => void;
}

interface UseCompanionSyncOptions extends CompanionHandlers {
  enabled: boolean;
}

export function useCompanionSync({
  enabled,
  onNavigation,
  onRORefresh,
  onROPatch,
  onStoryQuality,
  onStoryCertification,
}: UseCompanionSyncOptions) {
  const deviceId = getCompanionDeviceId();
  const [connectionState, setConnectionState] = useState<CompanionConnectionState>('disconnected');
  const [workflowStatus, setWorkflowStatus] = useState<CompanionWorkflowStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusProgress, setStatusProgress] = useState<number | null>(null);
  const [activities, setActivities] = useState<CompanionActivityEntry[]>([]);

  const seenIdsRef = useRef(new Set<string>());
  const applyingRemoteRef = useRef(false);
  const lastPublishedNavRef = useRef('');
  const lastPublishedStatusRef = useRef('');
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionGenerationRef = useRef(0);

  const handlersRef = useRef({
    onNavigation,
    onRORefresh,
    onROPatch,
    onStoryQuality,
    onStoryCertification,
  });
  handlersRef.current = {
    onNavigation,
    onRORefresh,
    onROPatch,
    onStoryQuality,
    onStoryCertification,
  };

  const pushActivity = useCallback((entry: CompanionActivityEntry) => {
    setActivities((prev) => [entry, ...prev].slice(0, MAX_ACTIVITY));
  }, []);

  const shouldIgnoreEvent = useCallback(
    (event: CompanionEvent) => {
      if (seenIdsRef.current.has(event.id)) return true;
      if (event.sourceDeviceId === 'server') return false;
      return event.sourceDeviceId === deviceId;
    },
    [deviceId]
  );

  const handleEvent = useCallback(
    async (event: CompanionEvent) => {
      if (shouldIgnoreEvent(event)) return;
      seenIdsRef.current.add(event.id);

      const handlers = handlersRef.current;
      switch (event.type) {
        case 'navigation':
          applyingRemoteRef.current = true;
          try {
            lastPublishedNavRef.current = `${event.view}:${event.repairOrderId}:${event.lineId}`;
            await handlers.onNavigation({
              view: event.view,
              repairOrderId: event.repairOrderId,
              lineId: event.lineId,
            });
          } finally {
            applyingRemoteRef.current = false;
          }
          break;
        case 'ro.refresh':
          void mutate(companionRoKey(event.repairOrderId));
          await handlers.onRORefresh(event.repairOrderId);
          break;
        case 'ro.patch':
          handlers.onROPatch({
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
            linePatch: event.linePatch,
          });
          break;
        case 'status':
          setWorkflowStatus(event.status);
          setStatusMessage(event.message ?? null);
          setStatusProgress(typeof event.progress === 'number' ? event.progress : null);
          if (event.status !== 'idle' && event.message?.trim()) {
            pushActivity({
              id: `${event.id}:workflow`,
              label: event.message.trim(),
              timestamp: event.timestamp,
              repairOrderId: event.repairOrderId,
              lineId: event.lineId,
            });
          }
          break;
        case 'activity':
          pushActivity({
            id: event.id,
            label: event.label,
            detail: event.detail,
            timestamp: event.timestamp,
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
          });
          break;
        case 'story.quality':
          void mutate(companionRoKey(event.repairOrderId));
          handlers.onStoryQuality({
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
            quality: event.quality,
          });
          pushActivity({
            id: `${event.id}:audit`,
            label: `MI audit score: ${event.quality.score}/100`,
            timestamp: event.timestamp,
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
          });
          break;
        case 'story.certification':
          void mutate(companionRoKey(event.repairOrderId));
          handlers.onStoryCertification({
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
            certifiedByName: event.certifiedByName,
            certifiedAt: event.certifiedAt,
            warrantyStory: event.warrantyStory,
            storyHash: event.storyHash,
          });
          pushActivity({
            id: `${event.id}:cert`,
            label: 'Story certified and saved',
            detail: event.certifiedByName,
            timestamp: event.timestamp,
            repairOrderId: event.repairOrderId,
            lineId: event.lineId,
          });
          break;
        default:
          break;
      }
    },
    [deviceId, pushActivity, shouldIgnoreEvent]
  );

  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  const postEvent = useCallback(
    async (event: Record<string, unknown>) => {
      try {
        const response = await fetch(PUBLISH_URL, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            [COMPANION_DEVICE_HEADER]: deviceId,
          },
          body: JSON.stringify({ event: { ...event, sourceDeviceId: deviceId } }),
        });
        if (!response.ok) {
          setConnectionState((state) => (state === 'connected' ? 'error' : state));
        }
      } catch {
        setConnectionState((state) => (state === 'connected' ? 'error' : state));
      }
    },
    [deviceId]
  );

  const publishNavigation = useCallback(
    (state: { view: AppView; repairOrderId: string | null; lineId: string | null }) => {
      if (applyingRemoteRef.current) return;
      const key = `${state.view}:${state.repairOrderId}:${state.lineId}`;
      if (key === lastPublishedNavRef.current) return;
      lastPublishedNavRef.current = key;
      void postEvent({
        id: crypto.randomUUID(),
        type: 'navigation',
        view: state.view,
        repairOrderId: state.repairOrderId,
        lineId: state.lineId,
      });
    },
    [postEvent]
  );

  const publishStatus = useCallback(
    (
      status: CompanionWorkflowStatus,
      options?: {
        message?: string;
        progress?: number;
        repairOrderId?: string | null;
        lineId?: string | null;
      }
    ) => {
      const publishKey = `${status}:${options?.message ?? ''}:${options?.progress ?? ''}:${options?.repairOrderId ?? ''}:${options?.lineId ?? ''}`;
      setWorkflowStatus(status);
      setStatusMessage(options?.message ?? null);
      setStatusProgress(typeof options?.progress === 'number' ? options.progress : null);
      if (publishKey === lastPublishedStatusRef.current) return;
      lastPublishedStatusRef.current = publishKey;
      void postEvent({
        id: crypto.randomUUID(),
        type: 'status',
        status,
        message: options?.message,
        progress: options?.progress,
        repairOrderId: options?.repairOrderId,
        lineId: options?.lineId,
      });
    },
    [postEvent]
  );

  const publishActivity = useCallback(
    (
      label: string,
      options?: { detail?: string; repairOrderId?: string | null; lineId?: string | null }
    ) => {
      const id = crypto.randomUUID();
      void postEvent({
        id,
        type: 'activity',
        label,
        detail: options?.detail,
        repairOrderId: options?.repairOrderId,
        lineId: options?.lineId,
      });
      pushActivity({
        id,
        label,
        detail: options?.detail,
        timestamp: new Date().toISOString(),
        repairOrderId: options?.repairOrderId,
        lineId: options?.lineId,
      });
    },
    [postEvent, pushActivity]
  );

  const publishROPatch = useCallback(
    (payload: { repairOrderId: string; lineId?: string; linePatch?: Partial<RepairLine> }) => {
      void postEvent({
        id: crypto.randomUUID(),
        type: 'ro.patch',
        ...payload,
      });
    },
    [postEvent]
  );

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disconnected');
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const generation = connectionGenerationRef.current + 1;
      connectionGenerationRef.current = generation;

      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      setConnectionState((s) => (s === 'connected' ? 'reconnecting' : 'connecting'));

      const source = new EventSource(STREAM_URL, { withCredentials: true });
      sourceRef.current = source;

      source.onopen = () => {
        if (cancelled || connectionGenerationRef.current !== generation) return;
        setConnectionState('connected');
      };

      source.onmessage = (message) => {
        if (cancelled || connectionGenerationRef.current !== generation) return;
        try {
          const payload = JSON.parse(message.data) as CompanionEvent | { type: 'connected' };
          if (payload.type === 'connected') return;
          void handleEventRef.current(payload as CompanionEvent);
        } catch {
          // ignore malformed SSE payloads
        }
      };

      source.onerror = () => {
        if (cancelled || connectionGenerationRef.current !== generation) return;
        source.close();
        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
        setConnectionState('reconnecting');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      connectionGenerationRef.current += 1;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnectionState('disconnected');
    };
  }, [enabled]);

  return {
    deviceId,
    connectionState,
    workflowStatus,
    statusMessage,
    statusProgress,
    activities,
    publishNavigation,
    publishStatus,
    publishActivity,
    publishROPatch,
  };
}