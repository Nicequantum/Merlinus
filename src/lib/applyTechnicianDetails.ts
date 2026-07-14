import type { RepairLine, TechnicianDetailPrompt } from '@/types';
import { AUDIT_ENHANCEMENT_NOTES_MARKER } from '@/prompts/story/shared/regenerateRules';
import { mergePendingCorrectionsIntoNotes } from '@/lib/storyRegenerateGuard';
import {
  appendUniqueDetailText,
  formatTechnicianDetailForStory,
  formatTechnicianDetailInsert,
} from '@/lib/storyDetailText';

export type TechnicianDetailFieldPatch = Partial<
  Pick<RepairLine, 'technicianNotes' | 'customerConcern' | 'warrantyStory'>
>;

export {
  appendUniqueDetailText,
  formatTechnicianDetailForStory,
  formatTechnicianDetailInsert,
} from '@/lib/storyDetailText';

function fieldPrefix(field: TechnicianDetailPrompt['field']): string {
  if (field === 'diagnostic') return '[Diagnostic] ';
  if (field === 'workflow') return '[Workflow] ';
  return '';
}

/**
 * Map AI coaching into editable line fields.
 * Always patches warrantyStory (scored text) so re-audit can credit improvements.
 * Also updates notes with pending-corrections fence for conservative regenerate.
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
    const tagged = `${AUDIT_ENHANCEMENT_NOTES_MARKER} ${fieldPrefix(detail.field)}${notesBody}`;
    patch.technicianNotes = appendUniqueDetailText(line.technicianNotes || '', tagged);
  }

  if (storyBody) {
    patch.warrantyStory = appendUniqueDetailText(line.warrantyStory || '', storyBody);
  }

  const notesBase = patch.technicianNotes ?? line.technicianNotes ?? '';
  patch.technicianNotes = mergePendingCorrectionsIntoNotes(notesBase, [detail]);

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
    const notesBody = formatTechnicianDetailInsert(detail);
    const storyBody = formatTechnicianDetailForStory(detail);

    if (detail.field === 'customerConcern' && notesBody) {
      concern = appendUniqueDetailText(concern, notesBody);
    } else if (notesBody) {
      const tagged = `${AUDIT_ENHANCEMENT_NOTES_MARKER} ${fieldPrefix(detail.field)}${notesBody}`;
      notes = appendUniqueDetailText(notes, tagged);
    }
    if (storyBody) {
      story = appendUniqueDetailText(story, storyBody);
    }
  }

  notes = mergePendingCorrectionsIntoNotes(notes, details);

  const result: TechnicianDetailFieldPatch = {};
  if (notes !== (line.technicianNotes || '')) result.technicianNotes = notes;
  if (concern !== (line.customerConcern || '')) result.customerConcern = concern;
  if (story !== (line.warrantyStory || '')) result.warrantyStory = story;
  return result;
}

export function technicianDetailActionLabel(field: TechnicianDetailPrompt['field']): string {
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
