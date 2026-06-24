'use client';

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { debounce } from '@/lib/debounce';
import { awaitRepairOrderSaveQueue, enqueueRepairOrderSave } from '@/lib/repairOrderSaveQueue';
import type { RepairOrder } from '@/types';
import { ensureComplaintIds } from '@/utils/repairOrderFactory';

/** M21: persistence, debounced save, and serialized PUT queue extracted from useRepairOrders. */
export function useROPersistence(
  allROs: RepairOrder[],
  setAllROs: Dispatch<SetStateAction<RepairOrder[]>>,
  roRef: MutableRefObject<RepairOrder | null>,
  setCurrentRO: Dispatch<SetStateAction<RepairOrder | null>>
) {
  const persistRO = useCallback(
    async (ro: RepairOrder): Promise<RepairOrder> => {
      return enqueueRepairOrderSave(async () => {
        const isNew = !allROs.some((r) => r.id === ro.id) || ro.id.startsWith('ro-');
        if (isNew && ro.id.startsWith('ro-')) {
          const { repairOrder } = await api.createRepairOrder(ro);
          setAllROs((prev) => [repairOrder, ...prev.filter((r) => r.id !== ro.id)]);
          return repairOrder;
        }
        const { repairOrder } = await api.updateRepairOrder(ro.id, ro);
        setAllROs((prev) => prev.map((r) => (r.id === repairOrder.id ? repairOrder : r)));
        return repairOrder;
      });
    },
    [allROs, setAllROs]
  );

  const saveROImmediate = useCallback(
    async (ro: RepairOrder | null) => {
      if (ro) {
        try {
          const persisted = await persistRO(ro);
          const saved = ensureComplaintIds(
            ro.complaintIds && ro.complaintIds.length === persisted.complaints.length
              ? { ...persisted, complaintIds: ro.complaintIds }
              : persisted
          );
          roRef.current = saved;
          setCurrentRO(saved);
          setAllROs((prev) => {
            const idx = prev.findIndex((r) => r.id === saved.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = saved;
              return copy;
            }
            return [saved, ...prev];
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to save repair order');
        }
      } else {
        roRef.current = null;
        setCurrentRO(null);
      }
    },
    [persistRO, roRef, setAllROs, setCurrentRO]
  );

  const debouncedPersistRef = useRef(
    debounce((ro: RepairOrder) => {
      void saveROImmediate(ro);
    }, 450)
  );

  const flushPendingSave = useCallback(async () => {
    await debouncedPersistRef.current.flush();
    await awaitRepairOrderSaveQueue();
  }, []);

  const scheduleSaveRO = useCallback((ro: RepairOrder) => {
    debouncedPersistRef.current(ro);
  }, []);

  const applyROUpdate = useCallback(
    (updater: (ro: RepairOrder) => RepairOrder, options?: { immediate?: boolean }) => {
      const base = roRef.current;
      if (!base) return null;
      const updated = ensureComplaintIds(structuredClone(updater(base)));
      roRef.current = updated;
      setCurrentRO(updated);
      setAllROs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (options?.immediate) {
        debouncedPersistRef.current.cancel();
        void saveROImmediate(updated);
      } else {
        scheduleSaveRO(updated);
      }
      return updated;
    },
    [roRef, saveROImmediate, scheduleSaveRO, setAllROs, setCurrentRO]
  );

  return {
    persistRO,
    saveROImmediate,
    flushPendingSave,
    scheduleSaveRO,
    applyROUpdate,
    debouncedPersistRef,
  };
}