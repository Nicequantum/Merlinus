/** Shared model identifiers — safe to import from tests and server code. */

export const GROK_STORY_MODEL =
  process.env.GROK_STORY_MODEL?.trim() || 'grok-4.20-0309-non-reasoning';

/** Vision + extraction — grok-4.3 supports image input. */
export const GROK_CHAT_MODEL = 'grok-4.3';