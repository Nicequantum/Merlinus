'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConsentModal } from '@/components/ConsentModal';
import { LegalDisclaimerModal } from '@/components/LegalDisclaimerModal';
import { LoginView } from '@/components/LoginView';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useMerlinLogout } from '@/hooks/useMerlinLogout';
import {
  acceptConsentSession,
  acceptLegalDisclaimerSession,
  fetchCurrentSession,
  loginWithCredentials,
} from '@/lib/loginSession';
import { api } from '@/lib/api';
import { isClerkSignInAvailable, shouldUseClerkOnlyLogin } from '@/lib/authModeClient';
import { clientLog } from '@/lib/clientLog';
import { needsConsent, needsLegalDisclaimer } from '@/lib/complianceSession';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const merlinLogout = useMerlinLogout();
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

  useEffect(() => {
    if (sessionPhase === 'anonymous' && shouldUseClerkOnlyLogin()) {
      router.replace('/sign-in');
    }
  }, [sessionPhase, router]);

  const refreshSession = useCallback(async () => {
    try {
      const latest = await fetchCurrentSession();
      if (latest) {
        setSession(latest);
        setSessionPhase('authenticated');
        return latest;
      }
      setSession(null);
      setSessionPhase('anonymous');
      return null;
    } catch (error: unknown) {
      clientLog.error('auth.session_refresh_failed', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (sessionPhase !== 'authenticated' || searchParams.get('link_account') !== '1') return;
    if (!isClerkSignInAvailable()) return;

    let cancelled = false;

    api
      .getClerkLinkStatus()
      .then(async (status) => {
        if (cancelled || !status.canLink) return;
        await api.linkClerkAccount();
        if (cancelled) return;
        toast.success('Clerk account linked');
        router.replace('/');
        await refreshSession();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clientLog.warn('auth.clerk_auto_link_skipped', error);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionPhase, searchParams, router, refreshSession]);

  const login = useCallback(async (d7Number: string, password: string) => {
    await loginWithCredentials(d7Number, password);
    const latest = await refreshSession();
    if (!latest) {
      throw new Error('Login succeeded but session could not be verified');
    }
    return latest;
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await merlinLogout();
    setSession(null);
    setSessionPhase('anonymous');
  }, [merlinLogout]);

  if (sessionPhase === 'checking') {
    return (
      <LoadingScreen
        label="Checking session"
        sublabel="Verifying your dealership sign-in…"
      />
    );
  }

  if (sessionPhase !== 'authenticated' || !session) {
    if (shouldUseClerkOnlyLogin()) {
      return (
        <LoadingScreen
          label="Redirecting to sign-in"
          sublabel="Opening secure dealership authentication…"
        />
      );
    }
    return <LoginView onLogin={login} />;
  }

  if (needsConsent(session)) {
    return (
      <ConsentModal
        loading={consentLoading}
        onAccept={async () => {
          setConsentLoading(true);
          try {
            const accepted = await acceptConsentSession();
            setSession(accepted);
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

  if (needsLegalDisclaimer(session)) {
    return (
      <LegalDisclaimerModal
        loading={legalDisclaimerLoading}
        onAccept={async () => {
          setLegalDisclaimerLoading(true);
          try {
            const accepted = await acceptLegalDisclaimerSession();
            cacheLegalDisclaimerLocally(accepted.technicianId);
            const latest = await refreshSession();
            setSession(latest ?? accepted);
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

  return (
    <BenzTechAuthenticatedApp
      session={session}
      onLogout={logout}
      onSessionRefresh={refreshSession}
    />
  );
}