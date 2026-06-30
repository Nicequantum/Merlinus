'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConsentModal } from '@/components/ConsentModal';
import { LegalDisclaimerModal } from '@/components/LegalDisclaimerModal';
import { LoginView } from '@/components/LoginView';
import { LoadingScreen } from '@/components/LoadingScreen';
import {
  acceptConsentSession,
  acceptLegalDisclaimerSession,
  fetchCurrentSession,
  loginWithCredentials,
  logoutSession,
} from '@/lib/loginSession';
import { clientLog } from '@/lib/clientLog';
import { cacheLegalDisclaimerLocally } from '@/lib/legalDisclaimer';
import type { TechnicianSession } from '@/types';

const BenzTechAuthenticatedApp = dynamic(
  () =>
    import('@/components/BenzTechAuthenticatedApp').then((m) => m.BenzTechAuthenticatedApp),
  {
    loading: () => (
      <LoadingScreen
        label="Starting Merlinus"
        sublabel="Loading warranty documentation tools…"
      />
    ),
    ssr: false,
  }
);

type SessionPhase = 'checking' | 'anonymous' | 'authenticated';

export function BenzTechApp() {
  const [session, setSession] = useState<TechnicianSession | null>(null);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('checking');
  const [consentLoading, setConsentLoading] = useState(false);
  const [legalDisclaimerLoading, setLegalDisclaimerLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentSession()
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setSession(existing);
          setSessionPhase('authenticated');
          return;
        }
        setSessionPhase('anonymous');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clientLog.error('auth.session_check_failed', error);
        setSessionPhase('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (d7Number: string, password: string) => {
    const nextSession = await loginWithCredentials(d7Number, password);
    setSession(nextSession);
    setSessionPhase('authenticated');
    return nextSession;
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    setSession(null);
    setSessionPhase('anonymous');
  }, []);

  // Login paints on first paint (SSR + CSR) until a session is confirmed.
  if (sessionPhase !== 'authenticated' || !session) {
    return <LoginView onLogin={login} />;
  }

  if (!session.consentAt) {
    return (
      <ConsentModal
        loading={consentLoading}
        onAccept={async () => {
          setConsentLoading(true);
          try {
            const consentAt = await acceptConsentSession();
            setSession((prev) => (prev ? { ...prev, consentAt } : prev));
          } catch (error: unknown) {
            clientLog.error('compliance.consent_accept_failed', error);
            toast.error(error instanceof Error ? error.message : 'Could not save consent — try again');
          } finally {
            setConsentLoading(false);
          }
        }}
      />
    );
  }

  if (!session.legalDisclaimerAt) {
    return (
      <LegalDisclaimerModal
        loading={legalDisclaimerLoading}
        onAccept={async () => {
          setLegalDisclaimerLoading(true);
          try {
            const legalDisclaimerAt = await acceptLegalDisclaimerSession();
            setSession((prev) => {
              if (!prev) return prev;
              cacheLegalDisclaimerLocally(prev.technicianId);
              return { ...prev, legalDisclaimerAt };
            });
          } catch (error: unknown) {
            clientLog.error('compliance.legal_disclaimer_accept_failed', error);
            toast.error(
              error instanceof Error ? error.message : 'Could not save legal acknowledgment — try again'
            );
          } finally {
            setLegalDisclaimerLoading(false);
          }
        }}
      />
    );
  }

  return <BenzTechAuthenticatedApp session={session} onLogout={logout} />;
}