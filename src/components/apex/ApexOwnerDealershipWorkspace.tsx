'use client';

import { useState } from 'react';
import type { ComponentType } from 'react';
import { ApexOwnerDealershipBar } from '@/components/apex/ApexOwnerDealershipBar';
import { exitOwnerDealership } from '@/lib/apexLoginSession';
import { clientLog } from '@/lib/clientLog';
import type { TechnicianSession } from '@/types';
import { toast } from 'sonner';

interface AuthenticatedAppProps {
  session: TechnicianSession;
  onLogout: () => Promise<void>;
  onSessionRefresh: () => Promise<TechnicianSession | null>;
}

interface ApexOwnerDealershipWorkspaceProps {
  session: TechnicianSession;
  onLogout: () => Promise<void>;
  onSessionRefresh: () => Promise<TechnicianSession | null>;
  AuthenticatedApp: ComponentType<AuthenticatedAppProps>;
}

export function ApexOwnerDealershipWorkspace({
  session,
  onLogout,
  onSessionRefresh,
  AuthenticatedApp,
}: ApexOwnerDealershipWorkspaceProps) {
  const [exiting, setExiting] = useState(false);
  const rooftopName = session.dealershipName;

  const handleExit = async () => {
    setExiting(true);
    try {
      await exitOwnerDealership();
      const latest = await onSessionRefresh();
      if (!latest || (latest.scopeMode ?? 'national') !== 'national') {
        throw new Error('Exit completed but session did not return to national scope');
      }
      toast.success('Returned to national scope');
    } catch (error: unknown) {
      clientLog.error('owner.dealership_exit_failed', error);
      toast.error(error instanceof Error ? error.message : 'Could not exit dealership');
    } finally {
      setExiting(false);
    }
  };

  return (
    <div data-platform="apex" className="apex-app-root min-h-dvh flex flex-col">
      <ApexOwnerDealershipBar
        dealershipName={rooftopName}
        loading={exiting}
        onExit={() => void handleExit()}
      />
      <div className="flex-1 min-h-0">
        <AuthenticatedApp
          session={session}
          onLogout={onLogout}
          onSessionRefresh={onSessionRefresh}
        />
      </div>
    </div>
  );
}