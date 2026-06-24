export { VoiceInputService } from './VoiceInputService';
export { NoiseMonitor } from './noiseMonitor';
export { computeAdaptiveConfidenceThreshold, passesConfidenceGate } from './confidence';
export { resolveVoiceErrorMessage, shouldAutoRestartAfterError, VOICE_ERROR_MESSAGES } from './errors';
export { getSpeechRecognitionCtor, isSpeechRecognitionSupported } from './speechRecognition';
export { DEFAULT_VOICE_INPUT_SETTINGS, type VoiceInputSettings } from './voiceSettings';
export type {
  VoiceInputMode,
  VoiceInputState,
  VoiceListeningState,
  VoicePermissionState,
  TranscriptMeta,
  SpeechRecognitionErrorCode,
} from './types';