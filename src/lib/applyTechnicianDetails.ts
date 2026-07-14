import type { RepairLine, TechnicianDetailPrompt } from '@/types';
import { AUDIT_ENHANCEMENT_NOTES_MARKER } from '@/prompts/story/shared/regenerateRules';

export type TechnicianDetailFieldPatch = Partial<
  Pick<RepairLine, 'technicianNotes' | 'customerConcern' | 'warrantyStory'>
>;

/** Append text once (no-op if already present). */
export function appendUniqueDetailText(existing: string, addition: string): string {
  const text = addition.trim();
  if (!text) return existing;
  const base = existing.trim();
  if (!base) return text;
  if (base.includes(text)) return existing;
  // Also skip if a shorter core phrase is already present
  if (text.length > 40 && base.includes(text.slice(0, Math.min(80, text.length)))) {
    return existing;
  }
  return `${base}\n\n${text}`;
}

/** Human-readable insert for notes fields. */
export function formatTechnicianDetailInsert(detail: TechnicianDetailPrompt): string {
  const prompt = detail.prompt?.trim() || '';
  const missing = detail.missing?.trim() || '';
  if (prompt && missing && !prompt.toLowerCase().includes(missing.toLowerCase().slice(0, 24))) {
    return `${missing}\n${prompt}`;
  }
  return prompt || missing;
}

/**
 * Story-ready prose for the warranty narrative (what the auditor actually scores).
 * Converts coaching imperatives into documented technician language.
 */
export function formatTechnicianDetailForStory(detail: TechnicianDetailPrompt): string {
  const missing = detail.missing?.trim() || '';
  let body = (detail.prompt?.trim() || missing).trim();
  if (!body) return '';

  body = body
    .replace(
      /^(please\s+)?(add|document|include|record|insert|provide|note|mention|list|write|enter)\s+(the\s+)?/i,
      ''
    )
    .replace(/^(that\s+)?(you\s+)?(should\s+)?/i, '')
    .trim();

  if (!body) body = missing;
  if (!body) return '';

  // Capitalize first letter
  body = body.charAt(0).toUpperCase() + body.slice(1);
  if (!/[.!?]$/.test(body)) body = `${body}.`;

  if (missing && !body.toLowerCase().includes(missing.toLowerCase().slice(0, 20))) {
    return `${missing}: ${body}`;
  }
  return body;
}

function fieldPrefix(field: TechnicianDetailPrompt['field']): string {
  if (field === 'diagnostic') return '[Diagnostic] ';
  if (field === 'workflow') return '[Workflow] ';
  return '';
}

/**
 * Map AI coaching into editable line fields.
 * Always patches warrantyStory (scored text) so re-audit can credit improvements.
 * Also updates notes / concern for regenerate + future context.
 */
export function applyTechnicianDetail(
  line: Pick<RepairLine, 'technicianNotes' | 'customerConcern' | 'warrantyStory'>,
  detail: TechnicianDetailPrompt
): TechnicianDetailFieldPatch {
  const notesBody = formatTechnicianDetailInsert(detail);
  const storyBody = formatTechnicianDetailForStory(detail);
  if (!notesBody && !storyBody) return {};

  const patch: TechnicianDetailFieldPatch = {};

  if (detail.field === 'customerConcern' && notesBody) {
    patch.customerConcern = appendUniqueDetailText(line.customerConcern || '', notesBody);
  } else if (notesBody) {
    // Tagged for regenerate prompts — must be woven into the rewrite, not left as an appendix.
    const tagged = `${AUDIT_ENHANCEMENT_NOTES_MARKER} ${fieldPrefix(detail.field)}${notesBody}`;
    patch.technicianNotes = appendUniqueDetailText(line.technicianNotes || '', tagged);
  }

  if (storyBody) {
    // Interim append so re-audit can credit content; regenerate rewrites this into prose.
    patch.warrantyStory = appendUniqueDetailText(line.warrantyStory || '', storyBody);
  }

  return patch;
}

/** Apply every detail in order; later items see earlier appends. */
export function applyAllTechnicianDetails(
  line: Pick<RepairLine, 'technicianNotes' | 'customerConcern' | 'warrantyStory'>,
  details: TechnicianDetailPrompt[]
): TechnicianDetailFieldPatch {
  let notes = line.technicianNotes || '';
  let concern = line.customerConcern || '';
  let story = line.warrantyStory || '';

  for (const detail of details) {
    const patch = applyTechnicianDetail(
      { technicianNotes: notes, customerConcern: concern, warrantyStory: story },
      detail
    );
    if (patch.technicianNotes !== undefined) notes = patch.technicianNotes;
    if (patch.customerConcern !== undefined) concern = patch.customerConcern;
    if (patch.warrantyStory !== undefined) story = patch.warrantyStory;
  }

  const result: TechnicianDetailFieldPatch = {};
  if (notes !== (line.technicianNotes || '')) result.technicianNotes = notes;
  if (concern !== (line.customerConcern || '')) result.customerConcern = concern;
  if (story !== (line.warrantyStory || '')) result.warrantyStory = story;
  return result;
}

export function technicianDetailActionLabel(field: TechnicianDetailPrompt['field']): string {
  // All paths also write into warrantyStory (the scored text); labels describe the gap type.
  switch (field) {
    case 'technicianNotes':
      return 'Add to Story + Notes';
    case 'customerConcern':
      return 'Add to Story + Concern';
    case 'diagnostic':
      return 'Add Diagnostic to Story';
    case 'workflow':
      return 'Add Workflow to Story';
    default:
      return 'Add to Story';
  }
}
