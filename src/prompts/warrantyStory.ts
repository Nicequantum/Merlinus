import type { RepairLine, RepairOrder } from '../types';
import { formatExtractedDataForPrompt } from '@/utils/diagnosticParser';
import { PROMPT_VERSION } from './version';

/** Balanced for quality + speed — slightly higher than bare-minimum for richer 3C prose. */
export const WARRANTY_STORY_TEMPERATURE = 0.2;

/** Typical production stories fit in ~450 tokens; cap keeps responses fast. */
export const WARRANTY_STORY_MAX_TOKENS = 500;

/** Field caps — enough diagnostic context without bloating the user message. */
export const PROMPT_FIELD_LIMITS = {
  ocr: 400,
  notes: 800,
  concern: 350,
} as const;

function truncatePromptField(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

/** Standard Mercedes-Benz warranty workflow — every story must cover these in order. */
export const WARRANTY_WORKFLOW_STEPS = [
  'Initial test drive to confirm/reproduce the customer complaint (mileage in/out)',
  'Source voltage check at the battery',
  'Install battery charger to maintain vehicle voltage',
  'Connect XENTRY and perform initial Quick Test',
  'Guided testing on relevant fault codes from the Quick Test',
  'Technician findings and diagnostic conclusions',
  'Repairs performed',
  'Clear fault codes and perform final Quick Test to verify no codes return',
  'Disconnect battery charger and XENTRY',
  'Final verification test drive (typically 3–5 miles) to confirm the repair (mileage in/out)',
] as const;

/** Compact workflow hint for prompts (full list kept for tests/audit). */
export const WARRANTY_WORKFLOW_SUMMARY =
  'test drive → source voltage → battery charger → XENTRY Quick Test → guided tests → findings → repair → clear codes/final Quick Test → disconnect charger/XENTRY → verification drive';

/**
 * Condensed 3C + MI 2.0 rules — full MI_AUDIT_GUIDELINES omitted to keep latency low.
 * Injected into SYSTEM_PROMPT; not sent as a separate bloated block.
 */
export const THREE_C_GENERATION_RULES = `Production-grade Mercedes-Benz MI 2.0 / Benz Bot 2.0 warranty narratives — NOT a light edit of technician notes.

Natural 3C flow in 3–5 connected paragraphs (NO visible headers, bullets, or lists):
• Concern — customer presentation, initial test drive, labeled RO complaint for this line.
• Cause — evidence-linked diagnostics: source voltage → battery charger → XENTRY Quick Test → guided tests → documented findings and root-cause conclusion.
• Correction — repairs performed, cleared codes, final Quick Test, disconnect charger/XENTRY, verification drive confirming resolution.

First-person technician voice. Active verbs. Precise Mercedes-Benz shop terminology (XENTRY, Quick Test, guided test, DTC/fault code, source voltage).
Expand sparse notes into professional audit-defensible prose using ONLY provided facts — never copy notes verbatim.
Weave all 10 workflow steps in chronological order. [NOT DOCUMENTED] for missing steps. Never invent codes, voltages, parts, or test results.`;

export const SYSTEM_PROMPT = `Merlin — Mercedes-Benz warranty story writer (${PROMPT_VERSION}).

${THREE_C_GENERATION_RULES}

Workflow sequence: ${WARRANTY_WORKFLOW_SUMMARY}.
Write ONLY the story for the requested line.`;

/** Legacy templates — not injected into fast-generation prompts. */
export const STORY_TEMPLATES = [
  'Chronological narrative in flowing paragraphs: customer presentation, diagnostic workflow, cause conclusion, repair, and verification drive — one continuous technician story.',
  'Evidence-first prose: open with test drive and source voltage, then walk through XENTRY Quick Test, guided tests, findings, repair, and final verification without list formatting.',
  'Concise audit record: tight technician sentences, every workflow step present in paragraph form, honest placeholders for undocumented elements.',
  'Road-test bookends: initial and final drives frame the story; diagnostics and repair unfold naturally between them.',
  'XENTRY-centered paragraphs: foreground Quick Test and guided testing as the backbone of the cause narrative.',
  'Line-focused submission: tie the labeled RO complaint to this line in the opening paragraph and close with documented verification in plain technician language.',
];

export function buildWarrantyStoryUserMessage(ro: RepairOrder, line: RepairLine): string {
  const vehicle = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}`.replace(/\s+/g, ' ').trim();
  const miles = `${ro.vehicle.mileageIn}${ro.vehicle.mileageOut ? `→${ro.vehicle.mileageOut}` : ''}`;

  const xentryText = formatExtractedDataForPrompt(
    line.extractedData || { codes: [], faultCodes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
  );

  const lineOcr =
    line.xentryOcrTexts && line.xentryOcrTexts.length > 0
      ? truncatePromptField(line.xentryOcrTexts.join(' | '), PROMPT_FIELD_LIMITS.ocr)
      : '';

  const concern = truncatePromptField(
    line.customerConcern || line.description || '[NOT PROVIDED]',
    PROMPT_FIELD_LIMITS.concern
  );
  const notes = truncatePromptField(line.technicianNotes || '[NOT PROVIDED]', PROMPT_FIELD_LIMITS.notes);

  const complaint = (ro.complaints || []).slice(0, 3).join(' | ') || '[NOT PROVIDED]';

  return `Line ${line.lineNumber}: ${line.description}
RO ${ro.roNumber} | ${vehicle} | ${miles} mi
Complaint: ${concern}
RO complaints: ${complaint}
Notes: ${notes}
Diagnostics: ${xentryText || '[NOT PROVIDED]'}${lineOcr ? ` | OCR: ${lineOcr}` : ''}

Write a production 3C warranty narrative for this line only. Transform source data into professional technician prose — do not echo notes verbatim. Cover Concern, Cause, and Correction in flowing paragraphs plus all 10 workflow steps.`;
}