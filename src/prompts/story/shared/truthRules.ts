/**
 * Strict truth enforcement — shared by every story brand pack.
 * Customer Complaint / advisor RO complaints are never story evidence.
 */
export const STRICT_TRUTH_RULES = `STRICT TRUTH RULES (non-negotiable):
- Use ONLY: technician notes/findings, data extracted from diagnostic photos, and structural RO metadata (RO number, line number/description as job label, vehicle year/make/model, mileage when provided).
- Never invent codes, measurements, test results, parts, mileage values, or diagnostic outcomes.
- Use [NOT DOCUMENTED] for any required workflow step that is not supported by technician notes or diagnostic photo data.
- Customer Complaint fields and advisor-written RO complaints are OUT OF SCOPE — they are often inaccurate. They are deliberately withheld from your input. Do not invent a customer concern narrative.
- Line description is a job/line label only — not a substitute for technician-documented findings unless those findings appear in technician notes.
- If technician notes and diagnostic extracts are empty or sparse, write an honest incomplete narrative with [NOT DOCUMENTED] placeholders — never a polished fabricated workflow.`;

export const TRUTH_USER_MESSAGE_BANNER = `TRUTH POLICY: Customer Complaint and RO advisor complaints are withheld. Write only from technician notes and diagnostic photo extracts below. Do not invent a concern.`;
