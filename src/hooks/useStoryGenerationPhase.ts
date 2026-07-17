'use client';

import { useEffect, useState } from 'react';
import { ensureI18n } from '@/i18n/config';

/** i18n keys (line ns) for rotating status copy while Grok generates a warranty story. */
export const STORY_GENERATION_PHASES = ['phaseThinking', 'phaseWriting', 'phasePolishing'] as const;

const PHASE_KEYS = STORY_GENERATION_PHASES;

const PHASE_THRESHOLDS_MS = [0, 2_000, 6_000] as const;

function phaseMessage(index: number): string {
  return ensureI18n().t(PHASE_KEYS[index] ?? PHASE_KEYS[0], { ns: 'line' });
}

export function useStoryGenerationPhase(active: boolean): { message: string; progress: number } {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 350);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) {
    return { message: phaseMessage(0), progress: 0 };
  }

  let phaseIndex = 0;
  for (let i = PHASE_THRESHOLDS_MS.length - 1; i >= 0; i--) {
    if (elapsedMs >= PHASE_THRESHOLDS_MS[i]) {
      phaseIndex = i;
      break;
    }
  }

  // Ease toward 92% so the bar keeps moving without implying false completion.
  const progress = Math.min(92, 6 + elapsedMs / 850);

  return { message: phaseMessage(phaseIndex), progress };
}
