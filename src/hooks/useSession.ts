'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { cacheLegalDisclaimerLocally } from '@/lib/legalDisclaimer';
import type { TechnicianSession } from '@/types';

export function useSession() {
  const [session, setSession] = useState<TechnicianSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { session: s } = await api.me();
      setSession(s);
    } catch (error) {
      // M25: only 401 clears session — network/5xx blips should not force logout.
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (d7Number: string, password: string) => {
    const { session: s } = await api.login(d7Number, password);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setSession(null);
  }, []);

  const acceptConsent = useCallback(async () => {
    const result = await api.acceptConsent();
    if (result.session) {
      setSession(result.session);
      return;
    }
    setSession((prev) =>
      prev
        ? {
            ...prev,
            consentAt: result.consentAt,
            consentVersion: result.consentVersion,
          }
        : prev
    );
  }, []);

  const acceptLegalDisclaimer = useCallback(async () => {
    const result = await api.acceptLegalDisclaimer();
    if (result.session) {
      cacheLegalDisclaimerLocally(result.session.technicianId);
      setSession(result.session);
      return;
    }
    setSession((prev) => {
      if (!prev) return prev;
      cacheLegalDisclaimerLocally(prev.technicianId);
      return {
        ...prev,
        legalDisclaimerAt: result.legalDisclaimerAt,
        legalDisclaimerVersion: result.legalDisclaimerVersion,
      };
    });
  }, []);

  return { session, loading, login, logout, acceptConsent, acceptLegalDisclaimer, refresh };
}