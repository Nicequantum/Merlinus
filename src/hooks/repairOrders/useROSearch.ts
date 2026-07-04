'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError } from '@/lib/api';
import { clientLog } from '@/lib/clientLog';
import type { RepairOrderSummary, TechnicianSession } from '@/types';
import {
  matchesROSearch,
  mergeRepairOrders,
  SEARCH_PAGE_SIZE,
  sortRepairOrdersNewestFirst,
} from '@/hooks/repairOrders/roListUtils';

interface UseROSearchOptions {
  session: TechnicianSession | null;
  allROs: RepairOrderSummary[];
  setAllROs: Dispatch<SetStateAction<RepairOrderSummary[]>>;
  setTodayStartIso: Dispatch<SetStateAction<string | null>>;
}

/** Server-backed RO search with client VIN/make/model filtering on loaded rows. */
export function useROSearch({
  session,
  allROs,
  setAllROs,
  setTodayStartIso,
}: UseROSearchOptions) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const q = searchTerm.trim();
    if (!session || !q) {
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(() => {
      api
        .listRepairOrders({ q, limit: SEARCH_PAGE_SIZE })
        .then(({ repairOrders, todayStart }) => {
          setAllROs((prev) => mergeRepairOrders(prev, repairOrders));
          if (todayStart) setTodayStartIso(todayStart);
        })
        .catch((error: unknown) => {
          if (!(error instanceof ApiError && error.status === 401)) {
            clientLog.warn('Repair order search failed', error);
          }
        })
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, session, setAllROs, setTodayStartIso]);

  const searchROs = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return [];
    return sortRepairOrdersNewestFirst(allROs.filter((ro) => matchesROSearch(ro, q)));
  }, [allROs, searchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    searchLoading,
    searchROs,
  };
}