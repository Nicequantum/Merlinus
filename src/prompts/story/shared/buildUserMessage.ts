import type { RepairLine, RepairOrder } from '@/types';
import { formatExtractedDataForPrompt } from '@/utils/diagnosticParser';
import type { StoryBrandPack, VeteranPersona } from './types';
import { TRUTH_USER_MESSAGE_BANNER } from './truthRules';
import { PROMPT_FIELD_LIMITS, truncatePromptField } from './fieldLimits';

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

/**
 * Shared truth-filtered user message builder.
 * Omits Customer Complaint and RO advisor complaints entirely.
 */
export function buildStoryUserMessage(
  ro: RepairOrder,
  line: RepairLine,
  pack: StoryBrandPack
): string {
  const vehicle = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}`.replace(/\s+/g, ' ').trim();
  const miles = `${ro.vehicle.mileageIn}${ro.vehicle.mileageOut ? `→${ro.vehicle.mileageOut}` : ''}`;
  const persona = selectPersonaFromPack(pack, line.lineNumber);

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

  const notes = truncatePromptField(line.technicianNotes || '[NOT PROVIDED]', PROMPT_FIELD_LIMITS.notes, {
    // Keep newest notes (Add Tech Details appends at end) so regenerate sees improvements.
    preferEnd: true,
  });

  return `Line ${line.lineNumber}: ${line.description}
RO ${ro.roNumber} | ${vehicle} | ${miles} mi

${TRUTH_USER_MESSAGE_BANNER}

STYLE VARIATION — write as this veteran technician (persona ${persona.id}, ~${persona.years} years experience):
${persona.voice}

Technician notes (expand into professional prose; never copy verbatim; never invent facts not supported here):
<<<TECHNICIAN_NOTES>>
${notes}
<<<END_TECHNICIAN_NOTES>>
Diagnostics extracted from ${pack.diagnosticsSourceLabel}: ${diagnosticsText || '[NOT PROVIDED]'}${
    lineOcr ? ` | OCR: ${lineOcr}` : ''
  }

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
