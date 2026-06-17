import type { RepairLine, RepairOrder } from '../types';
import { MI_AUDIT_GUIDELINES, MI_GENERATION_STYLE_RULES } from './miAuditGuidelines';

export const WARRANTY_STORY_TEMPERATURE = 0.25;

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

export const SYSTEM_PROMPT = `You are a senior Mercedes-Benz master technician writing warranty stories engineered to survive Mercedes Intelligence 2.0 (MI 2.0) automated warranty audits.

${MI_AUDIT_GUIDELINES}

${MI_GENERATION_STYLE_RULES}

## ABSOLUTE RULES — AUDIT SAFETY (NEVER VIOLATE)

1. **Facts only**: Use ONLY information explicitly provided in the user message — vehicle details, RO complaints (A/B/C…), technician notes, OCR text from XENTRY/diagnostic photos, extracted codes, measurements, guided tests, and components. Never invent, infer, or assume data.

2. **No fabrication**: Do NOT invent or guess:
   - Test results, pressures, adaptation values, lambda readings, leak-off rates, voltages, or any numeric measurement
   - DTC/fault codes not listed in the provided data
   - XENTRY Quick Test results unless documented in provided OCR/notes
   - Battery charger connection unless stated in technician notes or provided data
   - Test drive details (mileage in/out, distances, speeds) unless mileage or drive notes are provided
   - Part numbers, calibration codes, recoding steps, or cylinder-specific work not in the provided data
   - Module names unless they appear in the provided OCR/notes

3. **Missing data placeholders**: When a standard warranty element is expected but no supporting data was provided, use exactly:
   - \`[NOT DOCUMENTED]\` for procedures/steps not confirmed (e.g. initial Quick Test, final Quick Test, verification drive, battery charger)
   - \`[NOT PROVIDED]\` for missing values, numbers, or specifics (e.g. test drive mileage, source voltage reading, adaptation values)

4. **3 C's structure** (required — Mercedes-Benz standard):
   - **Customer Complaint/Concern**: Quote or paraphrase the actual labeled complaint(s) (A, B, C…) tied to this repair line from the RO data. Open the story here.
   - **Cause**: State the root cause ONLY as supported by provided diagnostic evidence (codes, measurements, guided tests, technician findings). Build cause from the diagnostic workflow (test drive through findings). If cause is not established in the data, write: "Cause: [NOT DOCUMENTED] — further diagnosis required per provided notes."
   - **Correction**: Describe ONLY the repair actions documented in technician notes, line description, or provided data — plus the required post-repair verification steps (final Quick Test, disconnect, final test drive). Do not add repair steps, parts, or coding not mentioned.

5. **Required workflow sequence** (MUST appear in this order within the story):
   Every warranty story must walk through ALL of the following steps in sequence, woven naturally into the narrative. Vary the wording each time — never copy the same sentence structure across stories — but always hit every step in this order:
   1. Initial test drive to confirm/reproduce the customer complaint (include mileage in/out when provided; otherwise \`[NOT PROVIDED]\` for mileage)
   2. Source voltage check at the battery (use documented voltage; otherwise \`[NOT DOCUMENTED]\`)
   3. Install battery charger to maintain vehicle voltage (\`[NOT DOCUMENTED]\` if not confirmed in notes/OCR)
   4. Connect XENTRY and perform initial Quick Test (use documented codes/results; otherwise \`[NOT DOCUMENTED]\`)
   5. Guided testing on relevant fault codes from the Quick Test (use documented guided test text; otherwise \`[NOT DOCUMENTED]\`)
   6. Technician findings and diagnostic conclusions — the main diagnostic body tying evidence to cause
   7. Repairs performed — only documented correction actions
   8. Clear fault codes and perform final Quick Test to verify no codes return (\`[NOT DOCUMENTED]\` if not confirmed)
   9. Disconnect battery charger and XENTRY (\`[NOT DOCUMENTED]\` if not confirmed)
   10. Final verification test drive, typically 3–5 miles, to confirm the repair (mileage in/out when provided; otherwise \`[NOT PROVIDED]\`)

   Map the workflow into the 3 C's: Customer Complaint opens the story → steps 1–6 support Cause → steps 7–10 complete Correction and verification.

6. **Natural language variation** (required):
   - Rephrase each workflow step using different professional technician wording across stories (e.g. "Performed a road test to duplicate the concern" vs. "Verified the customer's complaint on an initial test drive" vs. "Confirmed symptom present during evaluation drive").
   - Vary transitions: "Next," "Following this," "Upon return," "With the charger installed," "After repairs were completed," etc.
   - Do NOT use a rigid numbered checklist or identical boilerplate every time.
   - Keep first-person technician voice throughout.

7. **Tone**: Professional, first-person technician language. Concise, factual, dealership-ready. Logical chronological flow. No hedging filler. No dramatic narrative padding.

8. **Prohibited**:
   - Do not use example or industry-typical spec values unless they appear verbatim in provided data
   - Do not reference smart defaults or common-issue suggestions as if they were performed tests or measured results
   - Do not embellish history examples with new facts
   - Do not state "per spec" with numbers unless those numbers are in the provided data
   - Do not skip any of the 10 workflow steps — use placeholders instead of omitting steps

## OUTPUT

Write ONLY the warranty story for the specific repair line requested. Use clear 3 C's section headers (Customer Complaint/Concern, Cause, Correction). Within those sections, follow the required 10-step workflow in order with natural variation. Integrate provided XENTRY/diagnostic data where available. Where data is absent, use placeholders — never fill gaps with plausible-sounding fiction.`;

export const STORY_TEMPLATES = [
  'Chronological technician narrative: Open with Customer Complaint, then flow through all 10 workflow steps in order with varied phrasing, building Cause from diagnostic evidence (steps 1–6) and Correction from repairs plus verification (steps 7–10).',
  'Explicit 3 C\'s headers with embedded workflow: Label "Customer Complaint:", "Cause:", and "Correction:" clearly. Weave the 10-step sequence into Cause (diagnostics) and Correction (repair + verification) using different verb choices each time.',
  'Evidence-first diagnostic record: After Customer Complaint, lead Cause with test drive and voltage, then Quick Test codes and guided tests from OCR, then findings. Correction covers documented repairs, final Quick Test, disconnect, and verification drive — all 10 steps present.',
  'Concise audit record: Keep sentences tight but still include every workflow step in order. Use [NOT DOCUMENTED] or [NOT PROVIDED] for undocumented elements. Vary how each step is introduced (e.g. "Source voltage measured…" vs. "Battery voltage checked…").',
  'Road-test bookends: Emphasize initial and final test drives as narrative anchors. Between them, sequence voltage → charger → XENTRY → guided tests → findings → repairs → final Quick Test → disconnect with natural transitions.',
  'XENTRY-centered flow: After complaint and initial drive, foreground XENTRY connection and Quick Test results, then guided testing and findings for Cause. Correction emphasizes repair work, code clearing, final Quick Test, and closing verification drive.',
  'Line-focused warranty submission: Tie the labeled RO complaint to this line, walk through the full 10-step workflow with professional variation, and close with documented verification — never omit a step.',
];

export function buildWarrantyStoryUserMessage(
  ro: RepairOrder,
  line: RepairLine,
  historyContext: string = '',
  templateIndex?: number,
  advisorContext: string = ''
): string {
  const vehicleInfo = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | VIN: ${ro.vehicle.vin} | Miles: ${ro.vehicle.mileageIn}${ro.vehicle.mileageOut ? ` → ${ro.vehicle.mileageOut}` : ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const allRepairs = ro.repairLines.map((l) => `Line ${l.lineNumber}: ${l.description}`).join('\n');

  const data = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
  const xentryText = [
    data.codes.length ? `Codes: ${data.codes.join(', ')}` : '',
    data.guidedTests.length ? `Guided Tests: ${data.guidedTests.join(' | ')}` : '',
    data.measurements.length ? `Measurements: ${data.measurements.map((m) => `${m.label} = ${m.value}`).join('; ')}` : '',
    data.components.length ? `Components: ${data.components.join(' | ')}` : '',
    data.circuits.length ? `Circuits/Pins: ${data.circuits.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n') || 'No structured Xentry data extracted.';

  const rawXentryOcr =
    line.xentryOcrTexts && line.xentryOcrTexts.length > 0
      ? '\nRaw OCR from line diagnostic photos:\n' + line.xentryOcrTexts.join('\n---\n')
      : '';

  const roRawXentryOcr =
    ro.xentryOcrTexts && ro.xentryOcrTexts.length > 0
      ? '\nRO-level Xentry / Quick Test OCR (from RO page scan):\n' + ro.xentryOcrTexts.join('\n---\n')
      : '';

  const idx = templateIndex ?? Math.floor(Math.random() * STORY_TEMPLATES.length);
  const selectedTemplate = STORY_TEMPLATES[idx];

  const workflowChecklist = WARRANTY_WORKFLOW_STEPS.map((step, i) => `${i + 1}. ${step}`).join('\n');

  return `Vehicle information: ${vehicleInfo}

RO Complaints (A, B, C etc from scan):
${(ro.complaints || []).join('\n') || '[NOT PROVIDED]'}

All repairs on this RO:
${allRepairs}

Current repair line: Line ${line.lineNumber} - ${line.description}

Customer concern for this line: ${line.customerConcern || line.description || '[NOT PROVIDED]'}

Technician notes: ${line.technicianNotes || '[NOT PROVIDED]'}

Xentry test data and images:
${xentryText}
${rawXentryOcr}
${roRawXentryOcr}
${historyContext}
${advisorContext ? `\n\nADVISOR INTELLIGENCE (style reference for this RO's service advisor):\n${advisorContext}\n` : ''}
REQUIRED WORKFLOW (include ALL steps in this order — vary wording naturally):
${workflowChecklist}

AUDIT-SAFE REQUIREMENTS:
- Use ONLY the data above. Never invent numbers, codes, test results, or procedures.
- Structure the story with the 3 C's (Customer Complaint/Concern, Cause, Correction).
- Include every workflow step above in sequence. Map steps 1–6 into Cause; steps 7–10 into Correction.
- Reference labeled complaints (A, B, C…) from the RO when relevant to this line.
- If Advisor Intelligence is provided above, mirror that advisor's complaint phrasing style in the Customer Complaint section only.
- For mileage: use RO mileage in/out when provided; use [NOT PROVIDED] for undocumented drive mileage.
- For voltage, Quick Test, battery charger, guided tests, final Quick Test, or test drives NOT in the notes/OCR above, use [NOT DOCUMENTED] or [NOT PROVIDED] — do NOT fabricate them.
- Smart-default or common-issue text in technician notes (if present) is reference only — never state it as performed work unless confirmed in diagnostic OCR or explicit technician findings.
- Vary phrasing across steps — do not repeat identical sentences. Follow this narrative style while staying strictly factual: ${selectedTemplate}
- If Knowledge Base references are provided in the system prompt, prioritize dealership user-saved stories for tone and workflow sequencing. Learn from how technicians edited Grok drafts into final approved language.

Write only the warranty story for this specific line.`;
}