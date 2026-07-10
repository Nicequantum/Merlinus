'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApexLoadingScreen } from '@/components/apex/ApexLoadingScreen';
import { ApexLoginShell, type ApexLoginShellResult } from '@/components/apex/ApexLoginShell';
import { ApexOwnerDealershipWorkspace } from '@/components/apex/ApexOwnerDealershipWorkspace';
import { ApexOwnerNationalShell } from '@/components/apex/ApexOwnerNationalShell';
import { ConsentModal } from '@/components/ConsentModal';
import { LegalDisclaimerModal } from '@/components/LegalDisclaimerModal';
import {
  loginWithIdentifier,
  selectDealershipSession,
} from '@/lib/apexLoginSession';
import { clientLog } from '@/lib/clientLog';
import { needsConsent, needsLegalDisclaimer } from '@/lib/complianceSession';
import {
  acceptConsentSession,
  acceptLegalDisclaimerSession,
  fetchCurrentSession,
} from '@/lib/loginSession';
import { useMerlinLogout } from '@/hooks/useMerlinLogout';
import { cacheLegalDisclaimerLocally } from '@/lib/legalDisclaimer';
import type { TechnicianSession } from '@/types';

const BenzTechAuthenticatedApp = dynamic(
  () =>
    import('@/components/BenzTechAuthenticatedApp').then((m) => m.BenzTechAuthenticatedApp),
  {
    loading: () => (
      <ApexLoadingScreen
        label="Loading workspace"
        sublabel="Preparing dealership tools…"
      />
    ),
    ssr: false,
  }
);

type SessionPhase = 'checking' | 'anonymous' | 'authenticated';

function isOwnerNationalScope(session: TechnicianSession): boolean {
  return session.role === 'owner' && (session.scopeMode ?? 'national') === 'national';
}

function isOwnerDealershipScope(session: TechnicianSession): boolean {
  return session.role === 'owner' && session.scopeMode === 'dealership';
}

export function ApexPlatformApp() {
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

  const login = useCallback(
    async (identifier: string, password: string): Promise<ApexLoginShellResult> => {
      const result = await loginWithIdentifier(identifier, password);
      if (result.status === 'select_dealership') {
        return {
          status: 'select_dealership',
          pendingToken: result.pendingToken,
          dealerships: result.dealerships,
        };
      }
      const latest = await refreshSession();
      if (!latest) {
        throw new Error('Login succeeded but session could not be verified');
      }
      return { status: 'success' };
    },
    [refreshSession]
  );

  const selectDealership = useCallback(
    async (pendingToken: string, dealershipId: string, rememberAsDefault = false) => {
      await selectDealershipSession(pendingToken, dealershipId, rememberAsDefault);
      const latest = await refreshSession();
      if (!latest) {
        throw new Error('Dealership selected but session could not be verified');
      }
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    await merlinLogout();
    setSession(null);
    setSessionPhase('anonymous');
  }, [merlinLogout]);

  if (sessionPhase === 'checking') {
    return (
      <div data-platform="apex" className="apex-app-root min-h-dvh apex-platform-stage">
        <ApexLoadingScreen
          label="Checking session"
          sublabel="Verifying secure platform access…"
        />
      </div>
    );
  }

  if (sessionPhase !== 'authenticated' || !session) {
    return <ApexLoginShell onLogin={login} onSelectDealership={selectDealership} />;
  }

  if (needsConsent(session)) {
    return (
      <div data-platform="apex" className="apex-app-root min-h-dvh apex-platform-stage">
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
      </div>
    );
  }

  if (needsLegalDisclaimer(session)) {
    return (
      <div data-platform="apex" className="apex-app-root min-h-dvh apex-platform-stage">
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
      </div>
    );
  }

  if (isOwnerNationalScope(session)) {
    return (
      <ApexOwnerNationalShell
        session={session}
        onLogout={logout}
        onSessionRefresh={refreshSession}
      />
    );
  }

  if (isOwnerDealershipScope(session)) {
    return (
      <ApexOwnerDealershipWorkspace
        session={session}
        onLogout={logout}
        onSessionRefresh={refreshSession}
        AuthenticatedApp={BenzTechAuthenticatedApp}
      />
    );
  }

  return (
    <div data-platform="apex" className="apex-app-root min-h-dvh apex-platform-stage">
      <BenzTechAuthenticatedApp
        session={session}
        onLogout={logout}
        onSessionRefresh={refreshSession}
      />
    </div>
  );
}