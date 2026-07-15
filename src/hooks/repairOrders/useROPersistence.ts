'use client';

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { debounce } from '@/lib/debounce';
import { mergePersistedWithClient } from '@/lib/repairOrderMerge';
import {
  awaitRepairOrderSaveQueue,
  awaitRepairOrderSaveQueueWithTimeout,
  enqueueRepairOrderSave,
  isRepairOrderSaveQueueBusy,
} from '@/lib/repairOrderSaveQueue';
import { repairOrderToSummary } from '@/utils/repairOrderSummary';
import type { RepairOrder, RepairOrderSummary } from '@/types';
import { ensureComplaintIds } from '@/utils/repairOrderFactory';

/** @deprecated use mergePersistedWithClient — kept for tests/call sites. */
export function preserveClientWarrantyStories(
  persisted: RepairOrder,
  client: RepairOrder | null
): RepairOrder {
  return mergePersistedWithClient(persisted, client);
}

/** @deprecated use mergePersistedWithClient */
export function preserveClientXentryMedia(
  persisted: RepairOrder,
  client: RepairOrder | null
): RepairOrder {
  return mergePersistedWithClient(persisted, client);
}

const DEFAULT_FLUSH_MAX_WAIT_MS = 5_000;

/** M21: persistence, debounced save, and serialized PUT queue extracted from useRepairOrders. */
export function useROPersistence(
  allROs: RepairOrderSummary[],
  setAllROs: Dispatch<SetStateAction<RepairOrderSummary[]>>,
  roRef: MutableRefObject<RepairOrder | null>,
  setCurrentRO: Dispatch<SetStateAction<RepairOrder | null>>
) {
  /** Monotonic local edit counter — companion snapshots skip when dirty. */
  const clientRevisionRef = useRef(0);
  const dirtyRef = useRef(false);
  /** Revision captured when the last successful save finished. */
  const lastSavedRevisionRef = useRef(0);

  const allROsRef = useRef(allROs);
  allROsRef.current = allROs;

  const saveROImmediateRef = useRef<(ro: RepairOrder | null, options?: { throwOnError?: boolean }) => Promise<void>>(
    async () => undefined
  );

  const applySavedRo = useCallback(
    (saved: RepairOrder) => {
      roRef.current = saved;
      setCurrentRO(saved);
      setAllROs((prev) => {
        const summary = repairOrderToSummary(saved);
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = summary;
          return copy;
        }
        return [summary, ...prev];
      });
    },
    [roRef, setAllROs, setCurrentRO]
  );

  const persistRO = useCallback(
    async (ro: RepairOrder): Promise<RepairOrder> => {
      return enqueueRepairOrderSave(async () => {
        // Always PUT the latest in-memory RO — stale queue entries must not wipe generated stories.
        const payload = roRef.current?.id === ro.id ? roRef.current : ro;
        const list = allROsRef.current;
        const isNew = !list.some((r) => r.id === payload.id) || payload.id.startsWith('ro-');
        if (isNew && payload.id.startsWith('ro-')) {
          const { repairOrder } = await api.createRepairOrder(payload);
          setAllROs((prev) => [
            repairOrderToSummary(repairOrder),
            ...prev.filter((r) => r.id !== payload.id),
          ]);
          return repairOrder;
        }
        const { repairOrder } = await api.updateRepairOrder(payload.id, payload);
        setAllROs((prev) =>
          prev.map((r) => (r.id === repairOrder.id ? repairOrderToSummary(repairOrder) : r))
        );
        return repairOrder;
      });
    },
    [roRef, setAllROs]
  );

  const resolveConflictAndRetry = useCallback(
    async (local: RepairOrder): Promise<RepairOrder> => {
      const { repairOrder: remote } = await api.getRepairOrder(local.id);
      const merged = mergePersistedWithClient(remote, roRef.current ?? local);
      // Server updatedAt is the concurrency token for the next PUT
      const withToken = { ...merged, updatedAt: remote.updatedAt };
      roRef.current = withToken;
      setCurrentRO(withToken);
      const { repairOrder } = await api.updateRepairOrder(withToken.id, withToken);
      toast.message('Merged remote changes and saved');
      return repairOrder;
    },
    [roRef, setCurrentRO]
  );

  const saveROImmediate = useCallback(
    async (ro: RepairOrder | null, options?: { throwOnError?: boolean }) => {
      if (ro) {
        const revisionAtStart = clientRevisionRef.current;
        try {
          let persisted: RepairOrder;
          try {
            persisted = await persistRO(ro);
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
              try {
                persisted = await resolveConflictAndRetry(roRef.current?.id === ro.id ? roRef.current! : ro);
              } catch (retryError) {
                toast.error(
                  retryError instanceof Error
                    ? retryError.message
                    : 'Could not resolve save conflict — reopen the RO'
                );
                if (options?.throwOnError) throw retryError;
                return;
              }
            } else {
              throw e;
            }
          }

          let saved = ensureComplaintIds(
            ro.complaintIds && ro.complaintIds.length === persisted.complaints.length
              ? { ...persisted, complaintIds: ro.complaintIds }
              : persisted
          );
          // Always re-merge with whatever the tech edited while the PUT was in flight.
          saved = mergePersistedWithClient(saved, roRef.current);

          if (clientRevisionRef.current > revisionAtStart) {
            // More local edits arrived during save — keep dirty so companion won't clobber.
            dirtyRef.current = true;
          } else {
            dirtyRef.current = false;
            lastSavedRevisionRef.current = clientRevisionRef.current;
          }

          applySavedRo(saved);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            toast.error(e.message);
            if (options?.throwOnError) throw e;
            return;
          }
          const message = e instanceof Error ? e.message : 'Failed to save repair order';
          toast.error(message);
          if (options?.throwOnError) {
            throw e instanceof Error ? e : new Error(message);
          }
        }
      } else {
        roRef.current = null;
        setCurrentRO(null);
        dirtyRef.current = false;
      }
    },
    [applySavedRo, persistRO, resolveConflictAndRetry, roRef, setCurrentRO]
  );

  saveROImmediateRef.current = saveROImmediate;

  const debouncedPersistRef = useRef(
    debounce((ro: RepairOrder) => {
      void saveROImmediateRef.current(ro);
    }, 450)
  );

  const flushPendingSave = useCallback(async (options?: { maxWaitMs?: number }) => {
    await debouncedPersistRef.current.flush();
    // Default bound so navigation / certify never hang forever on a stuck PUT.
    const maxWaitMs =
      options?.maxWaitMs === undefined ? DEFAULT_FLUSH_MAX_WAIT_MS : options.maxWaitMs;
    if (maxWaitMs && maxWaitMs > 0) {
      const ok = await awaitRepairOrderSaveQueueWithTimeout(maxWaitMs);
      if (!ok) {
        toast.message('Save still in progress — continuing with latest local data');
      }
      return;
    }
    await awaitRepairOrderSaveQueue();
  }, []);

  const scheduleSaveRO = useCallback((ro: RepairOrder) => {
    debouncedPersistRef.current(ro);
  }, []);

  const applyROUpdate = useCallback(
    (
      updater: (ro: RepairOrder) => RepairOrder,
      options?: { immediate?: boolean; skipPersist?: boolean }
    ) => {
      const base = roRef.current;
      if (!base) return null;
      const updated = ensureComplaintIds(structuredClone(updater(base)));
      clientRevisionRef.current += 1;
      if (!options?.skipPersist) {
        dirtyRef.current = true;
      }
      roRef.current = updated;
      setCurrentRO(updated);
      setAllROs((prev) =>
        prev.map((r) => (r.id === updated.id ? repairOrderToSummary(updated) : r))
      );
      if (options?.skipPersist) {
        return updated;
      }
      if (options?.immediate) {
        debouncedPersistRef.current.cancel();
        void saveROImmediateRef.current(updated);
      } else {
        scheduleSaveRO(updated);
      }
      return updated;
    },
    [roRef, scheduleSaveRO, setAllROs, setCurrentRO]
  );

  const cancelPendingSave = useCallback(() => {
    debouncedPersistRef.current.cancel();
  }, []);

  const isLocallyDirty = useCallback(() => {
    return dirtyRef.current || isRepairOrderSaveQueueBusy();
  }, []);

  const getClientRevision = useCallback(() => clientRevisionRef.current, []);

  const markCleanFromServer = useCallback(() => {
    dirtyRef.current = false;
    lastSavedRevisionRef.current = clientRevisionRef.current;
  }, []);

  return {
    persistRO,
    saveROImmediate,
    flushPendingSave,
    cancelPendingSave,
    scheduleSaveRO,
    applyROUpdate,
    debouncedPersistRef,
    isLocallyDirty,
    getClientRevision,
    markCleanFromServer,
  };
}
