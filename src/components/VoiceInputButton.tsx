'use client';

import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface VoiceInputButtonProps {
  targetRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onTranscript: (value: string) => void;
  className?: string;
}

export function VoiceInputButton({ targetRef, onTranscript, className = '' }: VoiceInputButtonProps) {
  const { isListening, isSupported, toggleListening } = useSpeechRecognition();

  const handleClick = () => {
    const el = targetRef.current;
    if (!el) return;
    if (!isSupported) {
      toast.error('Voice input is not supported in this browser');
      return;
    }
    toggleListening(el, onTranscript);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isListening ? 'Stop voice input' : 'Voice input'}
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
      className={`benz-voice-btn touch-target active:scale-95 ${isListening ? 'benz-voice-btn-active' : ''} ${className}`}
    >
      {isListening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}