/**
 * Safety net after AI revision: never lose prior-story facts or required corrections.
 * Also used as deterministic fallback when AI regenerate fails.
 */

import {
  appendUniqueDetailText,
  formatTechnicianDetailForStory,
} from '@/lib/storyDetailText';
import type { TechnicianDetailPrompt } from '@/types';
import {
  AUDIT_ENHANCEMENT_NOTES_MARKER,
  PENDING_CORRECTIONS_END,
  PENDING_CORRECTIONS_START,
} from '@/prompts/story/shared/regenerateRules';

/** Distinctive technical tokens that must survive a revision. */
export function extractTechnicalTokens(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b[PBCU]\d{4}[A-Z]?\b/gi,
    /\b\d{1,2}\.\d{1,2}\s*V\b/gi,
    /\bN\d+\/\d+\b/gi,
    /\bB\d+\/\d+\b/gi,
    /\bY\d+\/\d+\b/gi,
    /\b\d{5,}\b/g,
    /\b[A-Z]{1,3}\d{1,3}\/\d+\b/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      found.add(m[0]);
    }
  }
  return [...found];
}

function normalizeLoose(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True if a correction's distinctive content appears in the story. */
export function storyContainsCorrection(story: string, correction: string): boolean {
  const s = normalizeLoose(story);
  const c = normalizeLoose(correction);
  if (!c || c.length < 4) return true;
  if (s.includes(c)) return true;

  const tokens = extractTechnicalTokens(correction);
  if (tokens.length > 0) {
    const hit = tokens.filter((t) => s.includes(t.toLowerCase()));
    if (hit.length >= Math.min(tokens.length, 2) || (tokens.length === 1 && hit.length === 1)) {
      return true;
    }
  }

  const words = c
    .split(/[^a-z0-9./-]+/)
    .filter((w) => w.length >= 5)
    .slice(0, 8);
  if (words.length === 0) return false;
  const hits = words.filter((w) => s.includes(w)).length;
  return hits >= Math.ceil(words.length * 0.55);
}

/** Parse pending correction lines from notes fenced block + [Audit enhancement] lines. */
export function extractRequiredCorrectionsFromNotes(notes: string): string[] {
  const out: string[] = [];
  const start = notes.indexOf(PENDING_CORRECTIONS_START);
  const end = notes.indexOf(PENDING_CORRECTIONS_END);
  if (start >= 0 && end > start) {
    const body = notes.slice(start + PENDING_CORRECTIONS_START.length, end);
    for (const line of body.split(/\n/)) {
      const cleaned = line.replace(/^\d+\.\s*/, '').trim();
      if (cleaned) out.push(cleaned);
    }
  }
  for (const line of notes.split(/\n/)) {
    const t = line.trim();
    if (t.includes(AUDIT_ENHANCEMENT_NOTES_MARKER)) {
      out.push(t.replace(AUDIT_ENHANCEMENT_NOTES_MARKER, '').trim());
    }
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = normalizeLoose(c);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Ensure regenerated text keeps prior technical tokens and required corrections.
 * If the model thinned the draft badly, fall back toward the prior story and re-apply corrections.
 */
export function ensureStoryPreservesPriorAndCorrections(
  priorStory: string,
  regenerated: string,
  corrections: string[]
): string {
  const prior = priorStory.trim();
  let result = regenerated.trim();

  if (!result) return reapplyMissingCorrections(prior, corrections);
  if (!prior) return reapplyMissingCorrections(result, corrections);

  // Catastrophic shrink — keep prior and apply corrections.
  if (result.length < prior.length * 0.65) {
    result = prior;
  }

  const priorTokens = extractTechnicalTokens(prior);
  const missingTokens = priorTokens.filter(
    (t) => !result.toLowerCase().includes(t.toLowerCase())
  );
  if (missingTokens.length > 0 && missingTokens.length >= Math.max(1, Math.ceil(priorTokens.length * 0.25))) {
    result = prior;
  } else if (missingTokens.length > 0) {
    const restore = `Documented values retained from prior narrative: ${missingTokens.join(', ')}.`;
    result = appendUniqueDetailText(result, restore);
  }

  return reapplyMissingCorrections(result, corrections);
}

/**
 * Deterministic improvement when AI regenerate fails or is skipped:
 * keep prior story and weave in every pending correction.
 */
export function applyCorrectionsToStoryDeterministically(
  priorStory: string,
  corrections: string[]
): string {
  return ensureStoryPreservesPriorAndCorrections(priorStory, priorStory, corrections);
}

function reapplyMissingCorrections(story: string, corrections: string[]): string {
  let result = story;
  for (const raw of corrections) {
    if (storyContainsCorrection(result, raw)) continue;
    const prose = formatTechnicianDetailForStory({
      missing: '',
      prompt: raw,
      field: 'technicianNotes',
    } as TechnicianDetailPrompt);
    if (prose) result = appendUniqueDetailText(result, prose);
  }
  return result;
}

/** Build fenced pending-corrections block for notes (regen input). */
export function formatPendingCorrectionsBlock(details: TechnicianDetailPrompt[]): string {
  if (!details.length) return '';
  const lines = details.map((d, i) => {
    const body =
      d.missing && d.prompt && !d.prompt.toLowerCase().includes(d.missing.toLowerCase().slice(0, 20))
        ? `${d.missing}: ${d.prompt}`
        : d.prompt || d.missing;
    return `${i + 1}. ${body.trim()}`;
  });
  return `${PENDING_CORRECTIONS_START}\n${lines.join('\n')}\n${PENDING_CORRECTIONS_END}`;
}

/** Merge or replace the pending corrections fence in notes. */
export function mergePendingCorrectionsIntoNotes(
  existingNotes: string,
  details: TechnicianDetailPrompt[]
): string {
  if (!details.length) return existingNotes;
  const block = formatPendingCorrectionsBlock(details);
  const base = existingNotes.trim();
  const start = base.indexOf(PENDING_CORRECTIONS_START);
  const end = base.indexOf(PENDING_CORRECTIONS_END);
  if (start >= 0 && end > start) {
    const before = base.slice(0, start).trimEnd();
    const after = base.slice(end + PENDING_CORRECTIONS_END.length).trimStart();
    return [before, block, after].filter(Boolean).join('\n\n');
  }
  return base ? `${base}\n\n${block}` : block;
}
