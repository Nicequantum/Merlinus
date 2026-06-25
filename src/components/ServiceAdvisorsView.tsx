'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  Sparkles,
  Type,
  UserRound,
} from 'lucide-react';
import { BenzEmptyState } from '@/components/BenzEmptyState';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { AdvisorDetail, AdvisorListItem } from '@/types';

interface ServiceAdvisorsViewProps {
  onBack: () => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AdvisorDetailPanel({ advisor }: { advisor: AdvisorDetail }) {
  const profile = advisor.profile?.profileData;
  const formatting = profile?.formatting;
  const affinities = profile
    ? Object.entries(profile.vehicleAffinities).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-4">
      <div className="benz-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">{advisor.displayName}</div>
            <div className="text-xs text-benz-secondary mt-1">
              {advisor.roCount} linked RO{advisor.roCount === 1 ? '' : 's'} · First seen{' '}
              {formatDate(advisor.firstSeenAt)}
            </div>
          </div>
          <span className="status-pill bg-benz-accent/15 text-benz-blue border border-benz-accent/30">
            {advisor.profile?.observationCount ?? 0} obs
          </span>
        </div>
      </div>

      {formatting && (
        <div className="benz-card p-4">
          <div className="benz-section-title mb-3">Writing Style</div>
          <div className="grid grid-cols-2 gap-2.5 text-sm">
            <div className="benz-list-row p-3">
              <div className="text-xs text-benz-secondary">Avg length</div>
              <div className="font-medium mt-1">{formatting.avgComplaintLength || '—'} chars</div>
            </div>
            <div className="benz-list-row p-3">
              <div className="text-xs text-benz-secondary">Complaints / RO</div>
              <div className="font-medium mt-1">{formatting.avgComplaintsPerRo || '—'}</div>
            </div>
            <div className="benz-list-row p-3">
              <div className="text-xs text-benz-secondary">Letter labels</div>
              <div className="font-medium mt-1">{formatting.usesLetterLabels ? 'Yes' : 'No'}</div>
            </div>
            <div className="benz-list-row p-3">
              <div className="text-xs text-benz-secondary">All caps</div>
              <div className="font-medium mt-1">{formatting.typicallyAllCaps ? 'Usually' : 'Mixed'}</div>
            </div>
          </div>
        </div>
      )}

      {profile && profile.commonPhrases.length > 0 && (
        <div className="benz-card p-4">
          <div className="flex items-center gap-2 benz-section-title mb-3">
            <Type size={14} />
            Common Phrases
          </div>
          <div className="space-y-2">
            {profile.commonPhrases.slice(0, 8).map((phrase) => (
              <div key={phrase.text} className="benz-list-row flex justify-between gap-3 px-3 py-2.5">
                <span className="text-sm">{phrase.text}</span>
                <span className="text-xs text-benz-secondary shrink-0">{phrase.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {affinities.length > 0 && (
        <div className="benz-card p-4">
          <div className="benz-section-title mb-3">Vehicle Families</div>
          <div className="flex flex-wrap gap-2">
            {affinities.map(([family, weight]) => (
              <span key={family} className="status-pill status-pill-valid">
                {family} {Math.round(weight * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {advisor.recentObservations.length > 0 && (
        <div className="benz-card p-4">
          <div className="flex items-center gap-2 benz-section-title mb-3">
            <ClipboardList size={14} />
            Recent Complaints
          </div>
          <div className="space-y-2">
            {advisor.recentObservations.map((obs) => (
              <div key={obs.id} className="benz-list-row px-3 py-2.5">
                <div className="flex justify-between items-center gap-2 mb-1">
                  <span className="text-xs text-benz-blue font-semibold">
                    RO {obs.roNumber}
                    {obs.lineLabel ? ` · Line ${obs.lineLabel}` : ''}
                  </span>
                  <span className="text-xs text-benz-secondary">{formatDate(obs.observedAt)}</span>
                </div>
                <div className="text-sm leading-snug">{obs.complaint}</div>
                {obs.vehicle && <div className="text-xs text-benz-secondary mt-1">{obs.vehicle}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="benz-card p-4 benz-alert-info border">
        <div className="flex items-center gap-2 text-benz-blue text-sm font-medium mb-2">
          <Sparkles size={16} />
          Active in story generation
        </div>
        <p className="text-xs text-benz-secondary leading-relaxed">
          When a technician generates a warranty story on an RO linked to this advisor, the AI uses this
          profile to match how the advisor phrases customer concerns — while keeping all diagnostic facts
          audit-safe.
        </p>
      </div>
    </div>
  );
}

export function ServiceAdvisorsView({ onBack }: ServiceAdvisorsViewProps) {
  const [advisors, setAdvisors] = useState<AdvisorListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdvisorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAdvisors = useCallback(async () => {
    setLoading(true);
    try {
      const { advisors: list } = await api.listAdvisors();
      setAdvisors(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load service advisors');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { advisor } = await api.getAdvisor(id);
      setDetail(advisor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load advisor profile');
      setSelectedId(null);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdvisors();
  }, [loadAdvisors]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const selectedAdvisor = advisors.find((a) => a.id === selectedId);

  return (
    <div className="benz-page-compact">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => {
            if (selectedId) {
              setSelectedId(null);
              return;
            }
            onBack();
          }}
          className="benz-icon-btn -ml-1 touch-target text-benz-blue"
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="benz-dashboard-eyebrow text-left mb-0.5">Advisor Intelligence</div>
          <h1 className="text-xl font-bold tracking-tight truncate">
            {selectedAdvisor ? selectedAdvisor.displayName : 'Service Advisors'}
          </h1>
          <p className="text-xs text-benz-secondary mt-0.5 leading-snug">
            {selectedAdvisor
              ? 'Writing profile & captured complaints'
              : 'Learn how each advisor writes — so stories match their style'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="benz-card p-6 text-sm text-benz-secondary">Loading advisors...</div>
      ) : selectedId ? (
        detailLoading || !detail ? (
          <div className="benz-card p-6 text-sm text-benz-secondary">Loading profile...</div>
        ) : (
          <AdvisorDetailPanel advisor={detail} />
        )
      ) : advisors.length === 0 ? (
        <BenzEmptyState
          icon={UserRound}
          title="No service advisors captured yet"
          hint="Scan repair orders that show a Service Advisor name in the header. Profiles build automatically in the background."
        />
      ) : (
        <div className="space-y-2.5">
          {advisors.map((advisor) => (
            <button
              key={advisor.id}
              onClick={() => setSelectedId(advisor.id)}
              className="benz-settings-nav"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{advisor.displayName}</div>
                <div className="text-xs text-benz-secondary mt-1">
                  {advisor.roCount} RO{advisor.roCount === 1 ? '' : 's'} · {advisor.observationCount}{' '}
                  complaint{advisor.observationCount === 1 ? '' : 's'}
                  {advisor.typicallyAllCaps ? ' · ALL CAPS' : ''}
                </div>
                <div className="text-xs text-benz-muted">Last seen {formatDate(advisor.lastSeenAt)}</div>
              </div>
              <ChevronRight size={18} className="text-benz-secondary shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}