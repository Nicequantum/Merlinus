'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApexDealershipSelector } from '@/components/apex/ApexDealershipSelector';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import {
  formatOwnerActivityAction,
  formatOwnerActivityTime,
} from '@/components/apex/formatOwnerActivity';
import { enterOwnerDealership, fetchOwnerDealerships } from '@/lib/apexLoginSession';
import type { ApexDealershipOption } from '@/lib/apexDealershipOptions';
import type { OwnerNationalSummary } from '@/lib/ownerSummaryClient';
import { fetchOwnerNationalSummary } from '@/lib/ownerSummaryClient';
import { clientLog } from '@/lib/clientLog';
import type { TechnicianSession } from '@/types';
import { toast } from 'sonner';

type NationalView = 'dashboard' | 'enter-dealership';

interface ApexOwnerNationalShellProps {
  session: TechnicianSession;
  onLogout: () => Promise<void>;
  onSessionRefresh: () => Promise<TechnicianSession | null>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="apex-stat-card">
      <p className="apex-stat-value">{value.toLocaleString()}</p>
      <p className="apex-stat-label">{label}</p>
    </div>
  );
}

export function ApexOwnerNationalShell({
  session,
  onLogout,
  onSessionRefresh,
}: ApexOwnerNationalShellProps) {
  const [view, setView] = useState<NationalView>('dashboard');
  const [summary, setSummary] = useState<OwnerNationalSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dealerships, setDealerships] = useState<ApexDealershipOption[]>([]);
  const [loadingDealerships, setLoadingDealerships] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await fetchOwnerNationalSummary();
      setSummary(data);
    } catch (error: unknown) {
      clientLog.error('owner.summary_load_failed', error);
      setSummaryError(error instanceof Error ? error.message : 'Could not load dashboard');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openEnterDealership = useCallback(async () => {
    setView('enter-dealership');
    setLoadingDealerships(true);
    try {
      const list = await fetchOwnerDealerships();
      setDealerships(list);
    } catch (error: unknown) {
      clientLog.error('owner.dealerships_load_failed', error);
      toast.error(error instanceof Error ? error.message : 'Could not load dealerships');
      setView('dashboard');
    } finally {
      setLoadingDealerships(false);
    }
  }, []);

  const handleEnterDealership = async (dealershipId: string) => {
    setActionLoading(true);
    try {
      await enterOwnerDealership(dealershipId);
      const latest = await onSessionRefresh();
      if (!latest || (latest.scopeMode ?? 'national') === 'national') {
        throw new Error('Dealership entered but session did not update');
      }
      toast.success(`Entered ${latest.dealershipName}`);
    } catch (error: unknown) {
      clientLog.error('owner.dealership_enter_failed', error);
      toast.error(error instanceof Error ? error.message : 'Could not enter dealership');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="apex-app-root apex-national-dashboard" data-platform="apex">
      <header className="apex-national-header">
        <div className="apex-national-header-brand">
          <ApexLogoMark size="sm" title="Apex National Platform" />
          <div>
            <p className="apex-national-header-title">National Operations</p>
            <p className="apex-national-header-user">{session.name}</p>
          </div>
        </div>
        <div className="apex-national-header-actions">
          <div className="apex-scope-badge" aria-label="Current scope">
            <span aria-hidden="true">◆</span>
            National
          </div>
          <button
            type="button"
            className="apex-btn-secondary apex-national-signout touch-target"
            onClick={() => void onLogout()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="apex-national-main">
        {view === 'enter-dealership' ? (
          <section className="apex-national-panel apex-card apex-card-accent">
            <div className="apex-national-panel-head">
              <div>
                <h2 className="apex-national-panel-title">Enter dealership</h2>
                <p className="apex-hint">
                  Select a rooftop to access dealership PII and repair orders. This action is audited.
                </p>
              </div>
              <button
                type="button"
                className="apex-btn-secondary touch-target"
                disabled={actionLoading}
                onClick={() => setView('dashboard')}
              >
                Back
              </button>
            </div>
            {loadingDealerships ? (
              <p className="apex-hint apex-enter-loading">Loading rooftops…</p>
            ) : (
              <ApexDealershipSelector
                dealerships={dealerships}
                loading={actionLoading}
                showRememberDefault={false}
                title="Choose rooftop"
                subtitle="National scope has no PII access until you enter a dealership."
                onSelect={(dealershipId) => handleEnterDealership(dealershipId)}
              />
            )}
          </section>
        ) : (
          <>
            <section className="apex-national-hero apex-card apex-card-accent">
              <div className="apex-national-hero-copy">
                <h1 className="apex-national-hero-title">National command center</h1>
                <p className="apex-national-hero-subtitle">
                  Aggregate visibility across dealers and rooftops — no customer PII at national scope.
                </p>
              </div>
              <button
                type="button"
                className="apex-btn-primary apex-national-enter-btn touch-target"
                onClick={() => void openEnterDealership()}
              >
                Enter dealership
              </button>
            </section>

            {summaryLoading ? (
              <p className="apex-hint apex-national-loading">Loading national metrics…</p>
            ) : summaryError ? (
              <div className="apex-national-panel apex-card">
                <p className="apex-hint">{summaryError}</p>
                <button
                  type="button"
                  className="apex-btn-secondary touch-target"
                  onClick={() => void loadSummary()}
                >
                  Retry
                </button>
              </div>
            ) : summary ? (
              <>
                <section className="apex-stat-grid" aria-label="National metrics">
                  <StatCard label="Active dealers" value={summary.dealerCount} />
                  <StatCard label="Dealership rooftops" value={summary.dealershipCount} />
                  <StatCard label="Active users" value={summary.activeUsers} />
                  <StatCard label="RO volume (7 days)" value={summary.repairOrdersLast7Days} />
                </section>

                <section className="apex-national-panel apex-card">
                  <div className="apex-national-panel-head">
                    <h2 className="apex-national-panel-title">Recent platform activity</h2>
                    <button
                      type="button"
                      className="apex-btn-secondary touch-target"
                      onClick={() => void loadSummary()}
                    >
                      Refresh
                    </button>
                  </div>
                  {summary.recentActivity.length === 0 ? (
                    <p className="apex-hint">No recent activity recorded.</p>
                  ) : (
                    <ul className="apex-activity-feed">
                      {summary.recentActivity.map((item) => (
                        <li key={item.id} className="apex-activity-item">
                          <div className="apex-activity-top">
                            <span className="apex-activity-action">
                              {formatOwnerActivityAction(item.action)}
                            </span>
                            <time className="apex-activity-time" dateTime={item.createdAt}>
                              {formatOwnerActivityTime(item.createdAt)}
                            </time>
                          </div>
                          <p className="apex-activity-meta">
                            {item.dealershipName ?? 'Platform'}
                            {item.dealerCode ? ` · ${item.dealerCode}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}