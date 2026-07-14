import type { RepairLine, RepairOrder } from '@/types';
import { formatExtractedDataForPrompt } from '@/utils/diagnosticParser';
import type { StoryBrandPack, VeteranPersona } from './types';
import { TRUTH_USER_MESSAGE_BANNER } from './truthRules';
import { PROMPT_FIELD_LIMITS, truncatePromptField } from './fieldLimits';
import {
  AUDIT_ENHANCEMENT_NOTES_MARKER,
  STORY_REGENERATE_USER_HEADER,
} from './regenerateRules';

/** Prior story must be long enough to treat as a real first pass (not a stub). */
export const REGENERATE_PRIOR_STORY_MIN_CHARS = 40;

export type BuildStoryUserMessageOptions = {
  /**
   * Force first-pass or revision mode.
   * Default: auto — revision when line.warrantyStory is substantial.
   */
  mode?: 'generate' | 'regenerate' | 'auto';
  /** Override prior story text (defaults to line.warrantyStory). */
  priorStory?: string | null;
};

export function selectPersonaFromPack(
  pack: StoryBrandPack,
  lineNumber: number
): VeteranPersona {
  const personas = pack.personas;
  if (!personas.length) {
    return { id: 'A', years: 20, voice: 'Experienced master technician. Clear, evidence-first prose.' };
  }
  const index = Math.abs(lineNumber - 1) % personas.length;
  return personas[index]!;
}

export function shouldRegenerateStory(
  line: Pick<RepairLine, 'warrantyStory'>,
  options?: BuildStoryUserMessageOptions
): boolean {
  if (options?.mode === 'generate') return false;
  if (options?.mode === 'regenerate') return true;
  const prior = (options?.priorStory ?? line.warrantyStory ?? '').trim();
  return prior.length >= REGENERATE_PRIOR_STORY_MIN_CHARS;
}

function formatDiagnosticsBlock(line: RepairLine, pack: StoryBrandPack): string {
  const diagnosticsText = formatExtractedDataForPrompt(
    line.extractedData || {
      codes: [],
      faultCodes: [],
      guidedTests: [],
      measurements: [],
      components: [],
      circuits: [],
    }
  );
  const lineOcr =
    line.xentryOcrTexts && line.xentryOcrTexts.length > 0
      ? truncatePromptField(line.xentryOcrTexts.join(' | '), PROMPT_FIELD_LIMITS.ocr)
      : '';
  return `Diagnostics extracted from ${pack.diagnosticsSourceLabel}: ${diagnosticsText || '[NOT PROVIDED]'}${
    lineOcr ? ` | OCR: ${lineOcr}` : ''
  }`;
}

function extractAuditEnhancementsFromNotes(notes: string): string {
  const lines = notes.split(/\n/);
  const chunks: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (
      line.includes(AUDIT_ENHANCEMENT_NOTES_MARKER) ||
      line.startsWith('[Diagnostic]') ||
      line.startsWith('[Workflow]') ||
      /^\[Audit/i.test(line)
    ) {
      chunks.push(line.replace(AUDIT_ENHANCEMENT_NOTES_MARKER, '').trim());
    }
  }
  return chunks.filter(Boolean).join('\n');
}

/**
 * Shared truth-filtered user message builder.
 * Omits Customer Complaint and RO advisor complaints entirely.
 * When a prior story exists, builds a stronger REVISION pass prompt.
 */
export function buildStoryUserMessage(
  ro: RepairOrder,
  line: RepairLine,
  pack: StoryBrandPack,
  options?: BuildStoryUserMessageOptions
): string {
  const vehicle = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}`.replace(/\s+/g, ' ').trim();
  const miles = `${ro.vehicle.mileageIn}${ro.vehicle.mileageOut ? `→${ro.vehicle.mileageOut}` : ''}`;
  const persona = selectPersonaFromPack(pack, line.lineNumber);
  const diagnosticsBlock = formatDiagnosticsBlock(line, pack);

  const notesRaw = line.technicianNotes || '[NOT PROVIDED]';
  const notes = truncatePromptField(notesRaw, PROMPT_FIELD_LIMITS.notes, {
    preferEnd: true,
  });

  const priorStory = (options?.priorStory ?? line.warrantyStory ?? '').trim();
  const isRegen = shouldRegenerateStory(line, { ...options, priorStory });

  if (isRegen && priorStory) {
    const priorTruncated = truncatePromptField(priorStory, PROMPT_FIELD_LIMITS.priorStory, {
      preferEnd: false,
    });
    const enhancements = extractAuditEnhancementsFromNotes(notesRaw);
    const enhancementBlock = enhancements
      ? `Newly added technician / audit details that MUST be woven into the narrative (do not leave as an appendix):
<<<AUDIT_ENHANCEMENTS>>
${truncatePromptField(enhancements, 1_200, { preferEnd: true })}
<<<END_AUDIT_ENHANCEMENTS>>
`
      : `Any technical content that appears only at the end of the prior story (appended audit enhancements) must be integrated into the correct workflow steps — do not keep them as a dump at the end.
`;

    return `Line ${line.lineNumber}: ${line.description}
RO ${ro.roNumber} | ${vehicle} | ${miles} mi

${TRUTH_USER_MESSAGE_BANNER}

${STORY_REGENERATE_USER_HEADER}

STYLE VARIATION — write as this veteran technician (persona ${persona.id}, ~${persona.years} years experience):
${persona.voice}

<<<PRIOR_WARRANTY_STORY>>>
${priorTruncated}
<<<END_PRIOR_WARRANTY_STORY>>>

Technician notes (authoritative facts for this revision — integrate fully; never invent beyond this + diagnostics + prior story):
<<<TECHNICIAN_NOTES>>
${notes}
<<<END_TECHNICIAN_NOTES>>
${enhancementBlock}${diagnosticsBlock}

Rewrite a production 3C warranty narrative for Line ${line.lineNumber} only.
- Cover the full ${pack.workflowSteps.length}-step ${pack.displayLabel} diagnostic workflow in chronological order inside flowing paragraphs.
- Intelligently merge prior story + notes + audit enhancements into one coherent first-person narrative.
- Every supported detail must appear in the correct place in the workflow (not appended as a list).
- Use persona ${persona.id}'s voice — human, distinct, audit-defensible.
- Output ONLY the final rewritten warranty story.`;
  }

  return `Line ${line.lineNumber}: ${line.description}
RO ${ro.roNumber} | ${vehicle} | ${miles} mi

${TRUTH_USER_MESSAGE_BANNER}

STYLE VARIATION — write as this veteran technician (persona ${persona.id}, ~${persona.years} years experience):
${persona.voice}

Technician notes (expand into professional prose; never copy verbatim; never invent facts not supported here):
<<<TECHNICIAN_NOTES>>
${notes}
<<<END_TECHNICIAN_NOTES>>
${diagnosticsBlock}

${pack.generateClosingInstruction(line.lineNumber, persona.id)}`;
}

/**
 * Score/review context — same truth filter (no customer complaint / RO complaints as evidence).
 * Workflow list comes from the active brand pack.
 */
export function buildStoryQualityLineContext(
  ro: RepairOrder,
  line: RepairLine,
  pack: StoryBrandPack
): string {
  const diagnosticsText = formatExtractedDataForPrompt(
    line.extractedData || {
      codes: [],
      faultCodes: [],
      guidedTests: [],
      measurements: [],
      components: [],
      circuits: [],
    }
  );
  const workflowList = pack.workflowSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const notes = line.technicianNotes || '[NOT PROVIDED]';

  return `Line ${line.lineNumber}: ${line.description}
Vehicle: ${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | Miles ${ro.vehicle.mileageIn || '?'}/${ro.vehicle.mileageOut || '?'}
${TRUTH_USER_MESSAGE_BANNER}
Technician notes (supporting context — do not invent beyond notes/diagnostics/story):
<<<TECHNICIAN_NOTES>>
${notes}
<<<END_TECHNICIAN_NOTES>>
Diagnostics: ${diagnosticsText || 'None extracted.'}
Workflow steps required: ${workflowList}`;
}
