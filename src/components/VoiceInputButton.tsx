'use client';

// Voice dictation uses the browser Web Speech API; audio is sent to Google's speech service.
import { Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSharedVoiceInput } from '@/components/VoiceInputProvider';
import { setCompanionVoiceListening } from '@/lib/companionVoiceBridge';
import type { TranscriptMeta } from '@/lib/voice';

interface VoiceInputButtonProps {
  targetRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onTranscript: (value: string, meta?: TranscriptMeta) => void;
  onListeningChange?: (listening: boolean) => void;
  className?: string;
}

export function VoiceInputButton({
  targetRef,
  onTranscript,
  onListeningChange,
  className = '',
}: VoiceInputButtonProps) {
  const lastErrorRef = useRef<string | null>(null);
  const {
    isListening,
    activeTarget,
    isSupported,
    isEnabled,
    permission,
    listeningState,
    errorMessage,
    toggleListening,
    refreshPermission,
  } = useSharedVoiceInput();

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  const isActiveField =
    (isListening || listeningState === 'restarting') && activeTarget === targetRef.current;

  useEffect(() => {
    onListeningChange?.(isActiveField);
    setCompanionVoiceListening(isActiveField);
  }, [isActiveField, onListeningChange]);

  useEffect(() => {
    if (listeningState !== 'error' || !errorMessage) return;
    if (lastErrorRef.current === errorMessage) return;
    lastErrorRef.current = errorMessage;
    toast.error(errorMessage);
  }, [listeningState, errorMessage]);

  const handleTranscript = useCallback(
    (value: string, meta?: TranscriptMeta) => {
      onTranscript(value, meta);
    },
    [onTranscript]
  );

  const handleClick = () => {
    const el = targetRef.current;
    if (!el) return;

    if (!isEnabled) {
      toast.message('Voice input is disabled for this dealership. Type your notes below.');
      return;
    }
    if (!isSupported) {
      toast.error('Voice input is not supported in this browser. Use Chrome or Edge on your tablet.');
      return;
    }
    if (permission === 'denied') {
      toast.error('Microphone blocked. Open site settings and allow mic access, then reload.');
      return;
    }

    lastErrorRef.current = null;
    toggleListening(el, handleTranscript);
  };

  if (!isEnabled) return null;

  const micTitle = isActiveField ? 'Stop voice input' : 'Start voice input';
  const isActive = isActiveField;

  return (
    <button
      type="button"
      title={micTitle}
      aria-label={micTitle}
      aria-pressed={isActiveField}
      onClick={handleClick}
      className={`benz-voice-inline-btn touch-target ${isActive ? 'benz-voice-inline-btn-active' : ''} ${listeningState === 'restarting' ? 'benz-voice-inline-btn-restarting' : ''} ${className}`}
    >
      <span className="benz-voice-inline-btn-inner">
        {isActive && <span className="benz-voice-inline-pulse" aria-hidden />}
        {isActive ? <MicOff size={16} /> : <Mic size={16} />}
      </span>
    </button>
  );
}