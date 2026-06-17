'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Shield, Sparkles, Target } from 'lucide-react';
import type { StoryQualityResult, StoryReviewResult } from '@/types';

interface StoryQualityPanelProps {
  quality: StoryQualityResult;
  review?: StoryReviewResult | null;
  storyStale?: boolean;
}

const GRADE_LABELS: Record<StoryQualityResult['grade'], string> = {
  excellent: 'MI 2.0 Ready',
  strong: 'Strong — Minor Polish',
  'needs-work': 'Needs Work',
  'at-risk': 'At Risk',
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

export function StoryQualityPanel({ quality, review, storyStale }: StoryQualityPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showReviewDetail, setShowReviewDetail] = useState(!!review);

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
          {storyStale && (
            <p className="text-[10px] text-[#ff9f0a] mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Story edited since last score — run Review with AI to refresh
            </p>
          )}
        </div>
        {expanded ? <ChevronUp size={18} className="text-[#8e8e93] shrink-0" /> : <ChevronDown size={18} className="text-[#8e8e93] shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-[#38383a] pt-4">
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