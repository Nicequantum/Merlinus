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

/**
 * M19: When Chrome omits confidence, accept in noisy bays but gate in quiet conditions
 * where low-quality hallucinations are more likely without a score signal.
 */
export function passesConfidenceGate(
  confidence: number | null | undefined,
  threshold: number,
  noiseLevel = 0
): boolean {
  if (confidence == null || Number.isNaN(confidence)) {
    return noiseLevel >= 20;
  }
  return confidence >= threshold;
}