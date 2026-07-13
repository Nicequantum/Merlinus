/**
 * Merlin prompt system version — stamped on story.generate / review / edit / pdf_export
 * audit entries and included in the SHA-256 hash chain for warranty compliance audits.
 * Bump when making breaking or major prompt changes.
 */
/** Bumped for multi-brand packs + strict truth (tech notes + diagnostics only). */
export const PROMPT_VERSION = '4.0.0';

/** Optional dealership-specific rules (set MERLIN_DEALERSHIP_PROMPT_RULES in env). */
export function getDealershipPromptRules(): string {
  return process.env.MERLIN_DEALERSHIP_PROMPT_RULES?.trim() || '';
}