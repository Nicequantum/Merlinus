export { CONSENT_VERSION, WARRANTY_STORY_MAX_CHARS, WARRANTY_STORY_WARN_CHARS } from '@/types';

/** Override per deployment via env — defaults for local dev only. */
export const DEALERSHIP_DISPLAY_NAME =
  process.env.DEALERSHIP_DISPLAY_NAME?.trim() || 'Mercedes-Benz of Tiverton';
export const DEALERSHIP_CODE = process.env.DEALERSHIP_CODE?.trim() || 'VITI';

import { resolveVoiceInputSettings } from '@/lib/voice/voiceSettings';

/** Dealership voice input tuning — M18/M19 env overrides applied at module load. */
export const VOICE_INPUT_SETTINGS = resolveVoiceInputSettings();