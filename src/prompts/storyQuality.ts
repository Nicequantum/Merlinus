import type { RepairLine, RepairOrder } from '@/types';
import { MI_AUDIT_GUIDELINES } from './miAuditGuidelines';
import { WARRANTY_WORKFLOW_STEPS } from './warrantyStory';

export type StoryQualityGrade = 'excellent' | 'strong' | 'needs-work' | 'at-risk';

export interface StoryQualityResult {
  score: number;
  grade: StoryQualityGrade;
  strengths: string[];
  improvements: string[];
  auditRisks: string[];
  summary: string;
}

export interface StoryReviewFeedback {
  structure: string;
  technicalDetail: string;
  clarity: string;
  workflow: string;
  fabricationRisk: string;
}

export interface StoryReviewResult extends StoryQualityResult {
  feedback: StoryReviewFeedback;
  priorityActions: string[];
}

const SCORE_JSON_SCHEMA = `{
  "score": <integer 0-100>,
  "grade": "<excellent|strong|needs-work|at-risk>",
  "summary": "<one sentence overall assessment>",
  "strengths": ["<specific strength>", ...],
  "improvements": ["<specific improvement>", ...],
  "auditRisks": ["<MI 2.0 rejection risk>", ...]
}`;

const REVIEW_JSON_SCHEMA = `{
  "score": <integer 0-100>,
  "grade": "<excellent|strong|needs-work|at-risk>",
  "summary": "<one sentence overall assessment>",
  "strengths": ["..."],
  "improvements": ["..."],
  "auditRisks": ["..."],
  "feedback": {
    "structure": "<3 C's and section clarity>",
    "technicalDetail": "<codes, measurements, evidence linkage>",
    "clarity": "<readability and technician voice>",
    "workflow": "<10-step workflow completeness>",
    "fabricationRisk": "<fabrication or contradiction risks>"
  },
  "priorityActions": ["<top actionable fix>", ...]
}`;

export const STORY_SCORE_SYSTEM_PROMPT = `You are a Mercedes-Benz warranty audit specialist simulating Mercedes Intelligence 2.0 (MI 2.0) story review.

${MI_AUDIT_GUIDELINES}

## YOUR TASK
Score the provided warranty story against MI 2.0 audit criteria. Compare the story ONLY against the repair line context provided — do not assume undocumented data exists.

Grade mapping:
- excellent: score 90-100
- strong: score 75-89
- needs-work: score 60-74
- at-risk: score below 60

Be strict but fair. Penalize fabrication, missing workflow steps, weak cause-evidence chains, and missing 3 C's. Reward evidence-linked diagnostics and honest placeholders.

Respond with ONLY valid JSON matching this schema (no markdown, no commentary):
${SCORE_JSON_SCHEMA}`;

export const STORY_REVIEW_SYSTEM_PROMPT = `You are a senior Mercedes-Benz warranty coach helping technicians pass Mercedes Intelligence 2.0 audits.

${MI_AUDIT_GUIDELINES}

## YOUR TASK
Review the warranty story against MI 2.0 criteria and the repair line context. Provide a quality score AND specific, actionable coaching feedback.

Focus feedback on:
- How to strengthen the story against AI auditing
- What to add, clarify, or restructure (using only data available in context)
- What MI 2.0 would likely flag

Do NOT suggest inventing codes, measurements, or test results. Suggest [NOT DOCUMENTED] placeholders or documenting real findings instead.

Respond with ONLY valid JSON matching this schema (no markdown, no commentary):
${REVIEW_JSON_SCHEMA}`;

function buildLineContext(ro: RepairOrder, line: RepairLine): string {
  const data = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
  const xentryText = [
    data.codes.length ? `Codes: ${data.codes.join(', ')}` : '',
    data.guidedTests.length ? `Guided Tests: ${data.guidedTests.join(' | ')}` : '',
    data.measurements.length ? `Measurements: ${data.measurements.map((m) => `${m.label} = ${m.value}`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const workflowList = WARRANTY_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('\n');

  return `VEHICLE: ${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | VIN: ${ro.vehicle.vin} | Miles in: ${ro.vehicle.mileageIn || '[NOT PROVIDED]'} | Miles out: ${ro.vehicle.mileageOut || '[NOT PROVIDED]'}

RO COMPLAINTS:
${(ro.complaints || []).join('\n') || '[NOT PROVIDED]'}

LINE ${line.lineNumber}: ${line.description}
Customer concern: ${line.customerConcern || line.description}
Technician notes: ${line.technicianNotes || '[NOT PROVIDED]'}

DOCUMENTED DIAGNOSTIC DATA (only facts available — story must not claim beyond this):
${xentryText || 'No structured diagnostic data extracted.'}

REQUIRED WORKFLOW STEPS:
${workflowList}`;
}

export function buildStoryScoreUserMessage(ro: RepairOrder, line: RepairLine, warrantyStory: string): string {
  return `${buildLineContext(ro, line)}

WARRANTY STORY TO SCORE:
---
${warrantyStory}
---

Score this story for MI 2.0 audit survival. List 2-4 strengths, 2-4 improvements, and any audit risks (empty array if none).`;
}

export function buildStoryReviewUserMessage(ro: RepairOrder, line: RepairLine, warrantyStory: string): string {
  return `${buildLineContext(ro, line)}

WARRANTY STORY TO REVIEW:
---
${warrantyStory}
---

Provide MI 2.0 audit coaching. priorityActions must be 3-5 specific edits the technician can make now using only available data.`;
}

export function gradeFromScore(score: number): StoryQualityGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'needs-work';
  return 'at-risk';
}

function clampScore(score: unknown): number {
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asStringArray(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((s) => s.trim().length > 0).slice(0, max);
}

function asGrade(value: unknown, score: number): StoryQualityGrade {
  const grades: StoryQualityGrade[] = ['excellent', 'strong', 'needs-work', 'at-risk'];
  if (typeof value === 'string' && grades.includes(value as StoryQualityGrade)) {
    return value as StoryQualityGrade;
  }
  return gradeFromScore(score);
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseStoryQualityResponse(raw: string): StoryQualityResult {
  const payload = extractJsonPayload(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {
      score: 0,
      grade: 'at-risk',
      strengths: [],
      improvements: ['Unable to parse quality score — try reviewing again.'],
      auditRisks: ['Score analysis unavailable'],
      summary: 'Quality analysis could not be completed.',
    };
  }

  const score = clampScore(parsed.score);
  return {
    score,
    grade: asGrade(parsed.grade, score),
    strengths: asStringArray(parsed.strengths),
    improvements: asStringArray(parsed.improvements),
    auditRisks: asStringArray(parsed.auditRisks),
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : 'Quality assessment complete.',
  };
}

export function parseStoryReviewResponse(raw: string): StoryReviewResult {
  const payload = extractJsonPayload(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    const fallback = parseStoryQualityResponse(raw);
    return {
      ...fallback,
      feedback: {
        structure: 'Review could not be parsed — try again.',
        technicalDetail: '',
        clarity: '',
        workflow: '',
        fabricationRisk: '',
      },
      priorityActions: ['Re-run Review with AI'],
    };
  }

  const quality = parseStoryQualityResponse(payload);
  const feedbackRaw = (parsed.feedback ?? {}) as Record<string, unknown>;

  return {
    ...quality,
    feedback: {
      structure: String(feedbackRaw.structure ?? '').trim() || 'No structure feedback.',
      technicalDetail: String(feedbackRaw.technicalDetail ?? '').trim() || 'No technical detail feedback.',
      clarity: String(feedbackRaw.clarity ?? '').trim() || 'No clarity feedback.',
      workflow: String(feedbackRaw.workflow ?? '').trim() || 'No workflow feedback.',
      fabricationRisk: String(feedbackRaw.fabricationRisk ?? '').trim() || 'No fabrication risk noted.',
    },
    priorityActions: asStringArray(parsed.priorityActions, 5),
  };
}