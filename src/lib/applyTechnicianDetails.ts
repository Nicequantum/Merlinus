import type { RepairLine, TechnicianDetailPrompt } from '@/types';

export type TechnicianDetailFieldPatch = Partial<
  Pick<RepairLine, 'technicianNotes' | 'customerConcern'>
>;

/** Append text once (no-op if already present). */
export function appendUniqueDetailText(existing: string, addition: string): string {
  const text = addition.trim();
  if (!text) return existing;
  const base = existing.trim();
  if (!base) return text;
  if (base.includes(text)) return existing;
  return `${base}\n\n${text}`;
}

/** Human-readable insert for a coaching detail. */
export function formatTechnicianDetailInsert(detail: TechnicianDetailPrompt): string {
  const prompt = detail.prompt?.trim() || '';
  const missing = detail.missing?.trim() || '';
  if (prompt && missing && !prompt.toLowerCase().includes(missing.toLowerCase().slice(0, 24))) {
    return `${missing}\n${prompt}`;
  }
  return prompt || missing;
}

function fieldPrefix(field: TechnicianDetailPrompt['field']): string {
  if (field === 'diagnostic') return '[Diagnostic] ';
  if (field === 'workflow') return '[Workflow] ';
  return '';
}

/**
 * Map AI coaching fields onto editable line fields.
 * diagnostic/workflow have no dedicated textarea — land in technician notes with a tag.
 */
export function applyTechnicianDetail(
  line: Pick<RepairLine, 'technicianNotes' | 'customerConcern'>,
  detail: TechnicianDetailPrompt
): TechnicianDetailFieldPatch {
  const body = formatTechnicianDetailInsert(detail);
  if (!body) return {};

  if (detail.field === 'customerConcern') {
    return {
      customerConcern: appendUniqueDetailText(line.customerConcern || '', body),
    };
  }

  const tagged = `${fieldPrefix(detail.field)}${body}`;
  return {
    technicianNotes: appendUniqueDetailText(line.technicianNotes || '', tagged),
  };
}

/** Apply every detail in order; later items see earlier appends. */
export function applyAllTechnicianDetails(
  line: Pick<RepairLine, 'technicianNotes' | 'customerConcern'>,
  details: TechnicianDetailPrompt[]
): TechnicianDetailFieldPatch {
  let notes = line.technicianNotes || '';
  let concern = line.customerConcern || '';

  for (const detail of details) {
    const patch = applyTechnicianDetail(
      { technicianNotes: notes, customerConcern: concern },
      detail
    );
    if (patch.technicianNotes !== undefined) notes = patch.technicianNotes;
    if (patch.customerConcern !== undefined) concern = patch.customerConcern;
  }

  const result: TechnicianDetailFieldPatch = {};
  if (notes !== (line.technicianNotes || '')) result.technicianNotes = notes;
  if (concern !== (line.customerConcern || '')) result.customerConcern = concern;
  return result;
}

export function technicianDetailActionLabel(field: TechnicianDetailPrompt['field']): string {
  switch (field) {
    case 'technicianNotes':
      return 'Add to Technician Notes';
    case 'customerConcern':
      return 'Add to Customer Concern';
    case 'diagnostic':
      return 'Add to Diagnostic Evidence';
    case 'workflow':
      return 'Add to Workflow Steps';
    default:
      return 'Add to Notes';
  }
}
