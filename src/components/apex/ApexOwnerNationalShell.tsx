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
import type {
  OwnerNationalSummary,
  OwnerRooftopScorecard,
} from '@/lib/ownerSummaryClient';
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="apex-stat-card">
      <p className="apex-stat-value">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="apex-stat-label">{label}</p>
      {hint ? <p className="apex-stat-hint">{hint}</p> : null}
    </div>
  );
}

function statusClass(status: OwnerRooftopScorecard['status']): string {
  if (status === 'attention') return 'apex-rooftop-status apex-rooftop-status--attention';
  if (status === 'watch') return 'apex-rooftop-status apex-rooftop-status--watch';
  return 'apex-rooftop-status apex-rooftop-status--healthy';
}

function RooftopCard({
  rooftop,
  onEnter,
  entering,
}: {
  rooftop: OwnerRooftopScorecard;
  onEnter: (id: string) => void;
  entering: boolean;
}) {
  return (
    <article className="apex-rooftop-card apex-card">
      <div className="apex-rooftop-card-head">
        <div>
          <p className="apex-rooftop-code">{rooftop.dealerCode ?? '—'}</p>
          <h3 className="apex-rooftop-name">{rooftop.name}</h3>
          {rooftop.dealerName ? (
            <p className="apex-hint apex-rooftop-dealer">{rooftop.dealerName}</p>
          ) : null}
        </div>
        <span className={statusClass(rooftop.status)}>{rooftop.status}</span>
      </div>
      <dl className="apex-rooftop-metrics">
        <div>
          <dt>RO 7d</dt>
          <dd>{rooftop.roVolume7d}</dd>
        </div>
        <div>
          <dt>RO 30d</dt>
          <dd>{rooftop.roVolume30d}</dd>
        </div>
        <div>
          <dt>Certified 7d</dt>
          <dd>{rooftop.certifiedStories7d}</dd>
        </div>
        <div>
          <dt>Certified 30d</dt>
          <dd>{rooftop.certifiedStories30d}</dd>
        </div>
        <div>
          <dt>Staff</dt>
          <dd>{rooftop.activeStaff}</dd>
        </div>
        <div>
          <dt>Adoption</dt>
          <dd>{rooftop.adoptionRatePct}%</dd>
        </div>
      </dl>
      {rooftop.attentionReasons.length > 0 ? (
        <ul className="apex-rooftop-flags">
          {rooftop.attentionReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="apex-hint apex-rooftop-ok">No attention items</p>
      )}
      <button
        type="button"
        className="apex-btn-secondary apex-rooftop-enter touch-target"
        disabled={entering}
        onClick={() => onEnter(rooftop.dealershipId)}
      >
        Enter rooftop
      </button>
    </article>
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

  const isGroupHome = session.scopeMode === 'group';
  const homeTitle = isGroupHome
    ? session.dealerGroupName || 'Group operations'
    : 'National Operations';
  const scopeBadge = isGroupHome ? 'Group' : 'National';

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
      if (!latest || latest.scopeMode !== 'dealership') {
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
      <div className="apex-ambient apex-ambient--dashboard" aria-hidden="true">
        <div className="apex-ambient-grid" />
        <div className="apex-ambient-logo-wash" />
        <div className="apex-ambient-circuit" />
      </div>

      <header className="apex-national-header">
        <div className="apex-national-header-inner">
          <div className="apex-national-header-brand">
            <ApexLogoMark size="sm" title="Apex National Platform" />
            <div>
              <p className="apex-national-header-title">{homeTitle}</p>
              <p className="apex-national-header-user">{session.name}</p>
            </div>
          </div>
          <div className="apex-national-header-actions">
            <div className="apex-scope-badge" aria-label="Current scope">
              <span aria-hidden="true">◆</span>
              {scopeBadge}
            </div>
            <button
              type="button"
              className="apex-btn-secondary apex-national-signout touch-target"
              onClick={() => void onLogout()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="apex-national-main">
        {view === 'enter-dealership' ? (
          <section className="apex-national-panel apex-card apex-card-accent apex-national-panel--wide">
            <div className="apex-national-panel-head">
              <div>
                <h2 className="apex-national-panel-title">Enter dealership</h2>
                <p className="apex-hint">
                  {isGroupHome
                    ? 'Select a rooftop in your group to access dealership PII and repair orders. This action is audited.'
                    : 'Select a rooftop to access dealership PII and repair orders. This action is audited.'}
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
                subtitle={
                  isGroupHome
                    ? 'Group scope has no PII until you enter a dealership in your portfolio.'
                    : 'National scope has no PII access until you enter a dealership.'
                }
                onSelect={(dealershipId) => handleEnterDealership(dealershipId)}
              />
            )}
          </section>
        ) : (
          <>
            <section className="apex-national-hero apex-card apex-card-accent">
              <div className="apex-national-hero-copy">
                <p className="apex-login-kicker">
                  {isGroupHome ? 'Group command center' : 'Command center'}
                </p>
                <h1 className="apex-national-hero-title">
                  {isGroupHome
                    ? `${session.dealerGroupName || 'Group'} overview`
                    : 'National operations overview'}
                </h1>
                <p className="apex-national-hero-subtitle">
                  {isGroupHome
                    ? 'Tier 1 portfolio metrics across your franchise rooftops — no customer PII. Compare stores side by side, then enter a rooftop for bay work.'
                    : 'Aggregate visibility across dealers and rooftops — no customer PII at national scope. Enter a dealership when you need repair-order access.'}
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
              <p className="apex-hint apex-national-loading">
                {isGroupHome ? 'Loading group metrics…' : 'Loading national metrics…'}
              </p>
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
                <section
                  className="apex-stat-grid apex-stat-grid--tier1"
                  aria-label={isGroupHome ? 'Group Tier 1 metrics' : 'National Tier 1 metrics'}
                >
                  <StatCard label="Rooftops active" value={summary.dealershipCount} />
                  <StatCard label="Brands / dealers" value={summary.dealerCount} />
                  <StatCard label="Active staff" value={summary.activeUsers} />
                  <StatCard
                    label="RO volume"
                    value={summary.repairOrders7d}
                    hint={`${summary.repairOrders30d.toLocaleString()} in 30d`}
                  />
                  <StatCard
                    label="Stories certified"
                    value={summary.certifiedStories7d}
                    hint={`${summary.certifiedStories30d.toLocaleString()} in 30d`}
                  />
                  <StatCard
                    label="Adoption rate"
                    value={`${summary.adoptionRatePct}%`}
                    hint="Active staff with activity (7d)"
                  />
                  <StatCard
                    label="Attention flags"
                    value={summary.attentionFlagCount}
                    hint={
                      summary.attentionFlagCount === 0
                        ? 'All clear'
                        : 'Review flags below'
                    }
                  />
                </section>

                {summary.attentionFlags.length > 0 ? (
                  <section className="apex-national-panel apex-card apex-attention-panel">
                    <div className="apex-national-panel-head">
                      <h2 className="apex-national-panel-title">Attention</h2>
                    </div>
                    <ul className="apex-attention-list">
                      {summary.attentionFlags.map((flag, i) => (
                        <li
                          key={`${flag.code}-${flag.dealershipId ?? 'g'}-${i}`}
                          className={
                            flag.severity === 'attention'
                              ? 'apex-attention-item apex-attention-item--attention'
                              : 'apex-attention-item apex-attention-item--watch'
                          }
                        >
                          <span className="apex-attention-severity">{flag.severity}</span>
                          <span>
                            {flag.label}
                            {flag.dealershipName ? ` · ${flag.dealershipName}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="apex-national-panel apex-card">
                  <div className="apex-national-panel-head">
                    <div>
                      <h2 className="apex-national-panel-title">Rooftop comparison</h2>
                      <p className="apex-hint">
                        Side-by-side portfolio scoreboard — enter a rooftop for PII access.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="apex-btn-secondary touch-target"
                      onClick={() => void loadSummary()}
                    >
                      Refresh
                    </button>
                  </div>
                  {summary.rooftops.length === 0 ? (
                    <p className="apex-hint">No rooftops in this portfolio yet.</p>
                  ) : (
                    <div className="apex-rooftop-grid">
                      {summary.rooftops.map((rooftop) => (
                        <RooftopCard
                          key={rooftop.dealershipId}
                          rooftop={rooftop}
                          entering={actionLoading}
                          onEnter={(id) => void handleEnterDealership(id)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="apex-national-panel apex-card">
                  <div className="apex-national-panel-head">
                    <h2 className="apex-national-panel-title">
                      {isGroupHome ? 'Recent group activity' : 'Recent platform activity'}
                    </h2>
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
