'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { RepairOrderSummary, TechnicianSession } from '@/types';
import {
  filterTodayRepairOrders,
  mergeRepairOrders,
  PREVIOUS_PAGE_SIZE,
} from '@/hooks/repairOrders/roListUtils';

/** Today + previous pagination for the repair order home lists. */
export function useROList(session: TechnicianSession | null) {
  const [allROs, setAllROs] = useState<RepairOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listRetrying, setListRetrying] = useState(false);
  const [todayStartIso, setTodayStartIso] = useState<string | null>(null);
  const [previousROs, setPreviousROs] = useState<RepairOrderSummary[]>([]);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [previousLoading, setPreviousLoading] = useState(false);
  const [previousLoadingMore, setPreviousLoadingMore] = useState(false);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const [previousHasMore, setPreviousHasMore] = useState(false);
  const previousLoadedRef = useRef(false);

  const refreshList = useCallback(async () => {
    if (!session) {
      setAllROs([]);
      setPreviousROs([]);
      setListError(null);
      setLoading(false);
      setListRetrying(false);
      previousLoadedRef.current = false;
      setPreviousExpanded(false);
      return;
    }

    if (session.role === 'service_advisor') {
      setAllROs([]);
      setPreviousROs([]);
      setListError(null);
      setLoading(false);
      setListRetrying(false);
      previousLoadedRef.current = false;
      setPreviousExpanded(false);
      return;
    }

    setListError(null);
    try {
      const { repairOrders, todayStart } = await api.listRepairOrders({ scope: 'today' });
      setAllROs(repairOrders);
      if (todayStart) setTodayStartIso(todayStart);
      setPreviousROs([]);
      setPreviousCursor(null);
      setPreviousHasMore(false);
      previousLoadedRef.current = false;
      setPreviousExpanded(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAllROs([]);
        setListError(null);
        return;
      }
      setListError('Could not load repair orders. Check your connection and try again.');
      throw error;
    } finally {
      setLoading(false);
      setListRetrying(false);
    }
  }, [session]);

  const loadPreviousPage = useCallback(
    async (append: boolean) => {
      if (!session) return;
      if (append) setPreviousLoadingMore(true);
      else setPreviousLoading(true);

      try {
        const { repairOrders, nextCursor, hasMore, todayStart } = await api.listRepairOrders({
          scope: 'previous',
          limit: PREVIOUS_PAGE_SIZE,
          cursor: append ? previousCursor ?? undefined : undefined,
        });
        setPreviousROs((prev) => (append ? mergeRepairOrders(prev, repairOrders) : repairOrders));
        setAllROs((prev) => mergeRepairOrders(prev, repairOrders));
        setPreviousCursor(nextCursor ?? null);
        setPreviousHasMore(Boolean(hasMore));
        if (todayStart) setTodayStartIso(todayStart);
        previousLoadedRef.current = true;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          toast.error('Could not load previous repair orders — try again.');
        }
      } finally {
        setPreviousLoading(false);
        setPreviousLoadingMore(false);
      }
    },
    [previousCursor, session]
  );

  const togglePreviousExpanded = useCallback(() => {
    setPreviousExpanded((expanded) => {
      const next = !expanded;
      if (next && !previousLoadedRef.current) {
        void loadPreviousPage(false);
      }
      return next;
    });
  }, [loadPreviousPage]);

  const loadMorePrevious = useCallback(() => {
    if (previousLoading || previousLoadingMore || !previousHasMore) return;
    void loadPreviousPage(true);
  }, [loadPreviousPage, previousHasMore, previousLoading, previousLoadingMore]);

  const retryListLoad = useCallback(async () => {
    setListRetrying(true);
    setLoading(true);
    try {
      await refreshList();
    } catch {
      toast.error('Still unable to load repair orders — check Wi‑Fi or ask your manager.');
    }
  }, [refreshList]);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      setListError(null);
      setAllROs([]);
      setPreviousROs([]);
      return;
    }

    setLoading(true);
    refreshList().catch(() => {
      toast.error('Could not load repair orders — check your connection');
    });
  }, [session, refreshList]);

  const todayROs = useMemo(
    () => filterTodayRepairOrders(allROs, todayStartIso),
    [allROs, todayStartIso]
  );

  return {
    allROs,
    setAllROs,
    loading,
    listError,
    listRetrying,
    retryListLoad,
    refreshList,
    todayStartIso,
    setTodayStartIso,
    previousROs,
    previousExpanded,
    togglePreviousExpanded,
    previousLoading,
    previousLoadingMore,
    previousHasMore,
    loadMorePrevious,
    todayROs,
  };
}