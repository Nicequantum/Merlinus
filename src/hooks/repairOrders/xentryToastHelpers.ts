import { ensureI18n } from '@/i18n/config';

function xentryT(key: string, options?: Record<string, unknown>): string {
  return ensureI18n().t(key, { ns: 'xentry', ...options });
}

/** True when an Xentry per-image OCR/analysis result represents a failure. */
export function isXentryAnalysisFailure(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return (
    trimmed.includes('[Analysis failed:') ||
    trimmed.includes('[Analysis failed for this image]') ||
    trimmed.includes('[No diagnostic text extracted from image]')
  );
}

/** User-facing detail for a failed Xentry analysis line, when available. */
export function xentryAnalysisFailureDetail(text: string): string {
  const colonMatch = text.match(/\[Analysis failed: (.+)\]/);
  // Prefer the machine/API detail when present (often already user-facing English from the pipeline).
  if (colonMatch?.[1]?.trim()) return colonMatch[1].trim();
  // Generic failure markers — localize via xentry namespace.
  return xentryT('analysisFailed');
}