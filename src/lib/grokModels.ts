/** Shared model identifiers — safe to import from tests and server code. */

/**
 * Story generate + score (default: fast non-reasoning 4.20).
 * Override with GROK_STORY_MODEL for A/B (e.g. grok-4.3).
 */
export const GROK_STORY_MODEL =
  process.env.GROK_STORY_MODEL?.trim() || 'grok-4.20-0309-non-reasoning';

/**
 * Story review coaching. Defaults to story model for stack alignment;
 * override with GROK_STORY_REVIEW_MODEL if needed.
 */
export const GROK_STORY_REVIEW_MODEL =
  process.env.GROK_STORY_REVIEW_MODEL?.trim() || GROK_STORY_MODEL;

/** Vision + extraction — grok-4.3 supports image input. */
export const GROK_CHAT_MODEL = 'grok-4.3';