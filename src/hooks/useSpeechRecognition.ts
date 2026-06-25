'use client';

/**
 * Backward-compatible wrapper around useVoiceInput for legacy imports.
 * Prefer useVoiceInput or VoiceInputService directly for new code.
 */
import { useVoiceInput } from './useVoiceInput';

export function useSpeechRecognition() {
  const voice = useVoiceInput();

  return {
    isListening: voice.isListening,
    isSupported: voice.isSupported && voice.isEnabled,
    toggleListening: voice.toggleListening,
    stopListening: voice.stopListening,
    startListening: voice.startListening,
  };
}