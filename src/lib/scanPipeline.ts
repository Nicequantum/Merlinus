import { ApiError } from '@/lib/api';
import { GENERIC_ERROR } from '@/lib/errors';
import type { StructuredROExtraction } from '@/types';

/** Technician-facing message from a failed scan/extract API call — always prefer server text. */
export function formatScanApiError(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) {
    const msg = error.message?.trim();
    if (msg) {
      if (msg === GENERIC_ERROR) {
        return `Scan failed (HTTP ${error.status}): ${msg}`;
      }
      return msg;
    }
    return fallback
      ? `${fallback} (HTTP ${error.status})`
      : `Scan request failed (HTTP ${error.status}).`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback ?? 'Scan failed — no error details returned from server.';
}

export function isRetriableScanMessage(message: string): boolean {
  return /timed out|busy|unavailable|try again/i.test(message);
}

/** Grok returned enough structured data — skip waiting for slow on-device OCR. */
export function isStrongGrokExtraction(grok: StructuredROExtraction | null): boolean {
  if (!grok) return false;
  return assessRoExtractionQuality(grok).extractionStrength === 'strong';
}

export type RoExtractionStrength = 'strong' | 'partial' | 'weak';

export interface RoExtractionQualitySignals {
  extractionStrength: RoExtractionStrength;
  complaintCount: number;
  complaintLabelCount: number;
  hasRoNumber: boolean;
  hasVin17: boolean;
  hasVehicleIdentity: boolean;
}

/** PII-free quality signals for ro.extract audit metadata and scan telemetry. */
export function assessRoExtractionQuality(extracted: StructuredROExtraction): RoExtractionQualitySignals {
  const complaints = extracted.complaints?.filter((line) => line?.trim()) ?? [];
  const complaintCount = complaints.length;
  const complaintLabelCount = extracted.complaintLabels?.filter((l) => l?.trim()).length ?? 0;
  const hasRoNumber = Boolean(extracted.roNumber?.trim());
  const hasVin17 = (extracted.vehicle?.vin?.trim() ?? '').length === 17;
  const hasVehicleIdentity = Boolean(
    extracted.vehicle?.year?.trim() && extracted.vehicle?.make?.trim()
  );

  let extractionStrength: RoExtractionStrength = 'weak';
  if (complaintCount > 0 || (hasRoNumber && hasVin17)) {
    extractionStrength = 'strong';
  } else if (complaintCount > 0 || hasRoNumber || hasVin17 || hasVehicleIdentity) {
    extractionStrength = 'partial';
  }

  return {
    extractionStrength,
    complaintCount,
    complaintLabelCount,
    hasRoNumber,
    hasVin17,
    hasVehicleIdentity,
  };
}