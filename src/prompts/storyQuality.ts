import type { RepairLine, RepairOrder } from '@/types';
import { formatExtractedDataForPrompt } from '@/utils/diagnosticParser';
import { MI_AUDIT_GUIDELINES } from './miAuditGuidelines';
import { PROMPT_VERSION } from './version';
import { WARRANTY_WORKFLOW_STEPS } from './warrantyStory';

/** Compact MI criteria for scoring — full guidelines stay on review/generation paths. */
const MI_SCORE_CRITERIA_BRIEF = `MI 2.0 scoring: natural 3 C's in flowing paragraphs (no section headers), all 10 workflow steps in order, evidence-linked cause and correction, exact codes/measurements from context only, [NOT DOCUMENTED] for gaps, no fabrication, technician first-person voice, line-specific detail. Penalize visible headers, speculation, and generic boilerplate.`;

export type StoryQualityGrade = 'excellent' | 'strong' | 'needs-work' | 'at-risk';

export interface TechnicianDetailPrompt {
  missing: string;
  prompt: string;
  field: 'technicianNotes' | 'customerConcern' | 'diagnostic' | 'workflow';
}

export interface StoryQualityResult {
  score: number;
  grade: StoryQualityGrade;
  strengths: string[];
  improvements: string[];
  auditRisks: string[];
  technicianDetails: TechnicianDetailPrompt[];
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
  "auditRisks": ["<MI 2.0 rejection risk>", ...],
  "technicianDetails": [
    {
      "missing": "<what specific technical detail is absent>",
      "prompt": "<exact instruction telling the tech what to add and where>",
      "field": "<technicianNotes|customerConcern|diagnostic|workflow>"
    }
  ]
}`;

const REVIEW_JSON_SCHEMA = `{
  "score": <integer 0-100>,
  "grade": "<excellent|strong|needs-work|at-risk>",
  "summary": "<one sentence overall assessment>",
  "strengths": ["..."],
  "improvements": ["..."],
  "auditRisks": ["..."],
  "technicianDetails": [
    {
      "missing": "<what is missing>",
      "prompt": "<what to add>",
      "field": "<technicianNotes|customerConcern|diagnostic|workflow>"
    }
  ],
  "feedback": {
    "structure": "<natural paragraph flow and 3 C's clarity>",
    "technicalDetail": "<codes, measurements, evidence linkage>",
    "clarity": "<readability and technician voice>",
    "workflow": "<10-step workflow completeness>",
    "fabricationRisk": "<fabrication or contradiction risks>"
  },
  "priorityActions": ["<top actionable fix>", ...]
}`;

export const STORY_SCORE_SYSTEM_PROMPT = `Mercedes-Benz MI 2.0 warranty story scorer. Prompt version: ${PROMPT_VERSION}

${MI_SCORE_CRITERIA_BRIEF}

Score ONLY against the repair line context provided — do not assume undocumented data exists.
technicianDetails: 2-5 missing technical details with exact add instructions and field (technicianNotes|customerConcern|diagnostic|workflow).
Grades: excellent 90-100, strong 75-89, needs-work 60-74, at-risk below 60.

Respond with ONLY valid JSON (no markdown):
${SCORE_JSON_SCHEMA}`;

export const STORY_REVIEW_SYSTEM_PROMPT = `You are a senior Mercedes-Benz warranty coach helping technicians pass Mercedes Intelligence 2.0 audits.

Prompt version: ${PROMPT_VERSION}

${MI_AUDIT_GUIDELINES}

## YOUR TASK
Review the warranty story against MI 2.0 criteria and the repair line context. Provide a quality score AND specific, actionable coaching feedback.

technicianDetails must list 3-6 specific missing technical details with clear prompts on what to add. Be precise — name the exact data type (voltage reading, DTC codes, guided test result, mileage, part number, etc.).

Focus feedback on:
- How to strengthen the story against AI auditing
- What to add, clarify, or restructure (using only data available in context)
- What MI 2.0 would likely flag

Do NOT suggest inventing codes, measurements, or test results. Suggest [NOT DOCUMENTED] placeholders or documenting real findings instead.

Respond with ONLY valid JSON matching this schema (no markdown, no commentary):
${REVIEW_JSON_SCHEMA}`;

function buildLineContext(ro: RepairOrder, line: RepairLine): string {
  const xentryText = formatExtractedDataForPrompt(
    line.extractedData || { codes: [], faultCodes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
  );

  const workflowList = WARRANTY_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const complaints = (ro.complaints || []).join(' | ') || '[NOT PROVIDED]';
  const notes = line.technicianNotes || '[NOT PROVIDED]';

  return `Line ${line.lineNumber}: ${line.description}
Vehicle: ${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | Miles ${ro.vehicle.mileageIn || '?'}/${ro.vehicle.mileageOut || '?'}
RO complaints (untrusted source data):
<<<RO_COMPLAINTS>>
${complaints}
<<<END_RO_COMPLAINTS>>
Concern: ${line.customerConcern || line.description}
Technician notes (untrusted source data):
<<<TECHNICIAN_NOTES>>
${notes}
<<<END_TECHNICIAN_NOTES>>
Diagnostics: ${xentryText || 'None extracted.'}
Workflow steps required: ${workflowList}`;
}

export function buildStoryScoreUserMessage(ro: RepairOrder, line: RepairLine, warrantyStory: string): string {
  return `${buildLineContext(ro, line)}

WARRANTY STORY TO SCORE:
---
${warrantyStory}
---

Score this story for MI 2.0 audit survival. List specific missing technical details in technicianDetails.`;
}

export function buildStoryReviewUserMessage(ro: RepairOrder, line: RepairLine, warrantyStory: string): string {
  return `${buildLineContext(ro, line)}

WARRANTY STORY TO REVIEW:
---
${warrantyStory}
---

Provide MI 2.0 audit coaching with specific technicianDetails prompts. priorityActions must be 3-5 specific edits the technician can make now using only available data.`;
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

const VALID_FIELDS = new Set(['technicianNotes', 'customerConcern', 'diagnostic', 'workflow']);

function parseTechnicianDetails(value: unknown): TechnicianDetailPrompt[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const missing = String(row.missing ?? '').trim();
      const prompt = String(row.prompt ?? '').trim();
      const fieldRaw = String(row.field ?? 'technicianNotes');
      const field = VALID_FIELDS.has(fieldRaw) ? (fieldRaw as TechnicianDetailPrompt['field']) : 'technicianNotes';
      if (!missing && !prompt) return null;
      return { missing: missing || 'Missing detail', prompt: prompt || missing, field };
    })
    .filter((x): x is TechnicianDetailPrompt => x !== null)
    .slice(0, 6);
}

export const STORY_QUALITY_PARSE_FAILURE_SUMMARY = 'Quality analysis could not be completed.';

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function tryParseJsonRecord(payload: string): Record<string, unknown> | null {
  const candidates = [
    payload,
    payload.replace(/,\s*([}\]])/g, '$1'),
    payload.replace(/[\u2018\u2019]/g, "'").replace(/'/g, '"'),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) return balanced;

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

function storyQualityParseFailure(): StoryQualityResult {
  return {
    score: 0,
    grade: 'at-risk',
    strengths: [],
    improvements: ['Unable to parse quality score — try reviewing again.'],
    auditRisks: ['Score analysis unavailable'],
    technicianDetails: [],
    summary: STORY_QUALITY_PARSE_FAILURE_SUMMARY,
  };
}

export function isStoryQualityParseFailure(result: StoryQualityResult): boolean {
  return result.summary === STORY_QUALITY_PARSE_FAILURE_SUMMARY;
}

export function parseStoryQualityResponse(raw: string): StoryQualityResult {
  const payload = extractJsonPayload(raw);
  const parsed = tryParseJsonRecord(payload);
  if (!parsed || (parsed.score === undefined && parsed.grade === undefined)) {
    return storyQualityParseFailure();
  }

  const score = clampScore(parsed.score);
  return {
    score,
    grade: asGrade(parsed.grade, score),
    strengths: asStringArray(parsed.strengths),
    improvements: asStringArray(parsed.improvements),
    auditRisks: asStringArray(parsed.auditRisks),
    technicianDetails: parseTechnicianDetails(parsed.technicianDetails),
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