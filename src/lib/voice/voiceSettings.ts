/**
 * Dealership voice input configuration.
 * Tuned for noisy Mercedes-Benz service bays (tools, lifts, compressors).
 * Override per deployment by editing these defaults or extending constants.ts.
 */

export interface VoiceInputSettings {
  /** Master switch — when false, UI hides voice controls and manual input remains. */
  enabled: boolean;
  /** BCP-47 language tag passed to SpeechRecognition. */
  language: string;
  /** Keep the recognizer alive across pauses (with controlled auto-restart). */
  continuous: boolean;
  /** Stop and prompt retry if no usable speech within this window. */
  listeningTimeoutMs: number;
  /** Delay before auto-restart after benign errors or recognizer `onend`. */
  silenceRestartDelayMs: number;
  /** Cap auto-restarts to avoid infinite loops on broken mic/network states. */
  maxAutoRestarts: number;
  /** Baseline minimum confidence (0–1) in quiet conditions. */
  baseConfidenceThreshold: number;
  /** Floor confidence when background noise is high. */
  minConfidenceThreshold: number;
  /** How much noise level (0–100) lowers the confidence threshold. */
  noiseAdjustmentFactor: number;
  /** Default interaction mode for new sessions on this device. */
  pushToTalkDefault: boolean;
  /** Show real-time noise meter near the microphone control. */
  showNoiseMeter: boolean;
  /** Show recognition confidence percentage when the browser exposes it. */
  showConfidence: boolean;
  /** Request auto gain control on the monitoring microphone stream. */
  autoGainControl: boolean;
  /** Request browser noise suppression on the monitoring stream. */
  noiseSuppression: boolean;
  /** Request echo cancellation (helps when tablet speakers play notifications). */
  echoCancellation: boolean;
  /** Local storage key for technician push-to-talk preference. */
  modeStorageKey: string;
}

export const DEFAULT_VOICE_INPUT_SETTINGS: VoiceInputSettings = {
  enabled: true,
  language: 'en-US',
  continuous: true,
  listeningTimeoutMs: 15_000,
  silenceRestartDelayMs: 600,
  maxAutoRestarts: 10,
  baseConfidenceThreshold: 0.55,
  minConfidenceThreshold: 0.22,
  noiseAdjustmentFactor: 0.38,
  pushToTalkDefault: false,
  showNoiseMeter: true,
  showConfidence: true,
  autoGainControl: true,
  noiseSuppression: true,
  echoCancellation: true,
  modeStorageKey: 'merlin-voice-input-mode',
};