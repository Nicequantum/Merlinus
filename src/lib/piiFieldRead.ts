import { decryptPII, decryptSensitiveText } from '@/lib/encryption';

type RoNumberRow = {
  roNumberEncrypted?: string | null;
};

type DescriptionRow = {
  descriptionEncrypted?: string | null;
};

type AdvisorDisplayNameRow = {
  displayNameEncrypted?: string | null;
};

/** Phase 5: encrypted-only RO number read. */
export function readRoNumberFromDb(row: RoNumberRow): string {
  const encrypted = row.roNumberEncrypted?.trim();
  if (!encrypted) return '';
  try {
    return decryptPII(encrypted);
  } catch {
    return '';
  }
}

/** Phase 5: encrypted-only line description read. */
export function readDescriptionFromDb(row: DescriptionRow): string {
  const encrypted = row.descriptionEncrypted?.trim();
  if (!encrypted) return '';
  try {
    return decryptSensitiveText(encrypted);
  } catch {
    return '';
  }
}

/** Phase 5: encrypted-only advisor display name read. */
export function readAdvisorDisplayNameFromDb(row: AdvisorDisplayNameRow): string {
  const encrypted = row.displayNameEncrypted?.trim();
  if (!encrypted) return '';
  try {
    return decryptPII(encrypted);
  } catch {
    return '';
  }
}