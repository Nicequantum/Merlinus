'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Shield,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';
import type { StoryQualityResult, StoryReviewResult } from '@/types';

interface StoryQualityPanelProps {
  quality: StoryQualityResult;
  review?: StoryReviewResult | null;
  panelKey: string;
}

interface StoryQualityLoadingProps {
  mode: 'generating' | 'reviewing';
}

interface StoryQualityStaleProps {
  onReview?: () => void;
}

const GRADE_LABELS: Record<StoryQualityResult['grade'], string> = {
  excellent: 'MI 2.0 Ready',
  strong: 'Strong — Minor Polish',
  'needs-work': 'Needs Work',
  'at-risk': 'At Risk',
};

const FIELD_LABELS: Record<string, string> = {
  technicianNotes: 'Technician Notes',
  customerConcern: 'Customer Concern',
  diagnostic: 'Diagnostic Evidence',
  workflow: 'Workflow Steps',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-[#30d158]';
  if (score >= 75) return 'text-[#0a84ff]';
  if (score >= 60) return 'text-[#ff9f0a]';
  return 'text-[#ff3b30]';
}

function scoreRingColor(score: number): string {
  if (score >= 90) return 'border-[#30d158]/50 bg-[#30d158]/10';
  if (score >= 75) return 'border-[#0a84ff]/50 bg-[#0a84ff]/10';
  if (score >= 60) return 'border-[#ff9f0a]/50 bg-[#ff9f0a]/10';
  return 'border-[#ff3b30]/50 bg-[#ff3b30]/10';
}

export function StoryQualityLoadingPanel({ mode }: StoryQualityLoadingProps) {
  const label =
    mode === 'generating'
      ? 'Generating story and scoring against MI 2.0…'
      : 'Reviewing story against MI 2.0 audit criteria…';

  return (
    <div className="ios-card p-4 mt-3 border border-[#38383a] flex items-center gap-3">
      <Loader2 size={20} className="animate-spin text-[#0a84ff] shrink-0" />
      <div>
        <div className="text-xs uppercase tracking-widest text-[#8e8e93]">MI 2.0 Quality</div>
        <p className="text-sm text-[#d1d1d6] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function StoryQualityStaleBanner({ onReview }: StoryQualityStaleProps) {
  return (
    <div className="ios-card p-4 mt-3 border border-[#ff9f0a]/30 bg-[#ff9f0a]/5 flex items-start gap-3">
      <AlertTriangle size={18} className="text-[#ff9f0a] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-widest text-[#ff9f0a]">Score Outdated</div>
        <p className="text-sm text-[#d1d1d6] mt-1 leading-snug">
          This story was edited after the last score. Run Review with AI to get an accurate MI 2.0 assessment.
        </p>
        {onReview && (
          <button
            type="button"
            onClick={onReview}
            className="mt-2 text-xs text-[#0a84ff] font-medium"
          >
            Review with AI →
          </button>
        )}
      </div>
    </div>
  );
}

export function StoryQualityPanel({ quality, review, panelKey }: StoryQualityPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showReviewDetail, setShowReviewDetail] = useState(!!review);

  useEffect(() => {
    setExpanded(true);
    setShowReviewDetail(!!review);
  }, [panelKey, review]);

  return (
    <div className="ios-card p-4 mt-3 border border-[#38383a]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 text-left"
      >
        <div
          className={`shrink-0 w-14 h-14 rounded-2xl border flex flex-col items-center justify-center ${scoreRingColor(quality.score)}`}
        >
          <span className={`text-xl font-bold leading-none ${scoreColor(quality.score)}`}>{quality.score}</span>
          <span className="text-[9px] text-[#8e8e93] mt-0.5">/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield size={14} className="text-[#0a84ff]" />
            <span className="text-xs uppercase tracking-widest text-[#8e8e93]">MI 2.0 Quality Score</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreRingColor(quality.score)} ${scoreColor(quality.score)}`}>
              {GRADE_LABELS[quality.grade]}
            </span>
          </div>
          <p className="text-sm text-[#d1d1d6] mt-1 leading-snug">{quality.summary}</p>
        </div>
        {expanded ? <ChevronUp size={18} className="text-[#8e8e93] shrink-0" /> : <ChevronDown size={18} className="text-[#8e8e93] shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-[#38383a] pt-4">
          {quality.technicianDetails.length > 0 && (
            <div className="bg-[#0a84ff]/5 border border-[#0a84ff]/25 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#0a84ff] mb-2 flex items-center gap-1.5">
                <Wrench size={12} /> Add Technician Details
              </div>
              <p className="text-[10px] text-[#8e8e93] mb-3 leading-snug">
                MI 2.0 flagged these specific gaps. Add the missing details to your notes or story before submission.
              </p>
              <ul className="space-y-3">
                {quality.technicianDetails.map((detail, index) => (
                  <li key={`${detail.missing}-${index}`} className="text-xs leading-relaxed">
                    <div className="flex items-start gap-2">
                      <ClipboardList size={14} className="text-[#0a84ff] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-[#ff9f0a]">{detail.missing}</div>
                        <div className="text-[#d1d1d6] mt-0.5">{detail.prompt}</div>
                        <div className="text-[9px] text-[#8e8e93] mt-1 uppercase tracking-wide">
                          Add to: {FIELD_LABELS[detail.field] || detail.field}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quality.strengths.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#30d158] mb-2 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Strengths
              </div>
              <ul className="space-y-1.5">
                {quality.strengths.map((item) => (
                  <li key={item} className="text-xs text-[#c7c7cc] leading-relaxed pl-3 border-l-2 border-[#30d158]/40">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quality.improvements.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#ff9f0a] mb-2 flex items-center gap-1.5">
                <Target size={12} /> Improve for MI 2.0
              </div>
              <ul className="space-y-1.5">
                {quality.improvements.map((item) => (
                  <li key={item} className="text-xs text-[#c7c7cc] leading-relaxed pl-3 border-l-2 border-[#ff9f0a]/40">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quality.auditRisks.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#ff3b30] mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Audit Risks
              </div>
              <ul className="space-y-1.5">
                {quality.auditRisks.map((item) => (
                  <li key={item} className="text-xs text-[#ffb4ab] leading-relaxed pl-3 border-l-2 border-[#ff3b30]/40">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review && (
            <div>
              <button
                type="button"
                onClick={() => setShowReviewDetail((v) => !v)}
                className="text-[10px] uppercase tracking-widest text-[#0a84ff] flex items-center gap-1.5 mb-2"
              >
                <Sparkles size={12} />
                AI Review Coaching {showReviewDetail ? '▾' : '▸'}
              </button>
              {showReviewDetail && (
                <div className="space-y-3 bg-[#1c1c1e] rounded-xl p-3 border border-[#38383a]">
                  {review.priorityActions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#0a84ff] mb-1.5">Priority Actions</div>
                      <ol className="list-decimal list-inside space-y-1">
                        {review.priorityActions.map((action) => (
                          <li key={action} className="text-xs text-[#d1d1d6] leading-relaxed">
                            {action}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <ReviewSection title="Structure (3 C's)" text={review.feedback.structure} />
                  <ReviewSection title="Technical Detail" text={review.feedback.technicalDetail} />
                  <ReviewSection title="Clarity" text={review.feedback.clarity} />
                  <ReviewSection title="Workflow" text={review.feedback.workflow} />
                  <ReviewSection title="Fabrication Risk" text={review.feedback.fabricationRisk} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewSection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[#8e8e93] mb-0.5">{title}</div>
      <p className="text-xs text-[#c7c7cc] leading-relaxed">{text}</p>
    </div>
  );
}