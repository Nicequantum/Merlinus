import type { VoiceInputSettings } from './voiceSettings';

/**
 * Lowers the confidence bar as ambient noise rises.
 * Shop-floor tablets often yield lower Web Speech confidence scores even when
 * transcripts are usable — rejecting everything would frustrate technicians.
 */
export function computeAdaptiveConfidenceThreshold(
  noiseLevel: number,
  settings: Pick<VoiceInputSettings, 'baseConfidenceThreshold' | 'minConfidenceThreshold' | 'noiseAdjustmentFactor'>
): number {
  const clampedNoise = Math.min(100, Math.max(0, noiseLevel));
  const noiseFactor = clampedNoise / 100;
  const adjusted =
    settings.baseConfidenceThreshold - noiseFactor * settings.noiseAdjustmentFactor;
  return Math.max(settings.minConfidenceThreshold, Math.min(1, adjusted));
}

/** Returns true when a hypothesis should be accepted given adaptive thresholding. */
export function passesConfidenceGate(
  confidence: number | null | undefined,
  threshold: number
): boolean {
  // Chrome does not always populate confidence — accept when unknown.
  if (confidence == null || Number.isNaN(confidence)) return true;
  return confidence >= threshold;
}