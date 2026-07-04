'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';

type VoiceInputApi = ReturnType<typeof useVoiceInput>;

const VoiceInputContext = createContext<VoiceInputApi | null>(null);

/** Single app-wide voice pipeline — one mic session shared by all StableTextarea fields. */
export function VoiceInputProvider({ children }: { children: ReactNode }) {
  const voice = useVoiceInput();
  return <VoiceInputContext.Provider value={voice}>{children}</VoiceInputContext.Provider>;
}

export function useSharedVoiceInput(): VoiceInputApi {
  const voice = useContext(VoiceInputContext);
  if (!voice) {
    throw new Error('useSharedVoiceInput must be used within VoiceInputProvider');
  }
  return voice;
}