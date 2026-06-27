import { LEGAL_DISCLAIMER_VERSION } from '@/types';

const STORAGE_PREFIX = 'merlin.legalDisclaimer';

function storageKey(technicianId: string): string {
  return `${STORAGE_PREFIX}.${technicianId}`;
}

export function hasAcceptedLegalDisclaimer(technicianId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(storageKey(technicianId)) === LEGAL_DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

export function acceptLegalDisclaimer(technicianId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(technicianId), LEGAL_DISCLAIMER_VERSION);
  } catch {
    // localStorage unavailable — gate remains until a successful write
  }
}