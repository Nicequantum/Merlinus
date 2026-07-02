import 'server-only';

import type { RepairLine, RepairOrder } from '@/types';
import { decryptPII, encryptPII } from './encryption';
import { logger } from './logger';
import { hashWarrantyStory } from './storyHash';

export interface StoryCertificationState {
  certifiedByName: string;
  certifiedAt: string;
  storyHash: string;
  certifiedByTechnicianId: string;
}

export const CLEAR_STORY_CERTIFICATION_DB = {
  storyCertifiedAt: null as Date | null,
  storyCertifiedByTechnicianId: null as string | null,
  storyCertifiedByNameEncrypted: '',
  storyCertifiedHash: '',
};

type DbLineCertFields = {
  storyCertifiedAt?: Date | null;
  storyCertifiedByTechnicianId?: string | null;
  storyCertifiedByNameEncrypted?: string;
  storyCertifiedHash?: string;
};

export function mapStoryCertificationFromDbLine(line: DbLineCertFields): StoryCertificationState | null {
  if (!line.storyCertifiedAt || !line.storyCertifiedByTechnicianId || !line.storyCertifiedHash?.trim()) {
    return null;
  }

  let certifiedByName = '';
  if (line.storyCertifiedByNameEncrypted) {
    try {
      certifiedByName = decryptPII(line.storyCertifiedByNameEncrypted);
    } catch (error) {
      logger.error('story_certification.decrypt_name_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }
  if (!certifiedByName.trim()) return null;

  return {
    certifiedByName: certifiedByName.trim(),
    certifiedAt: line.storyCertifiedAt.toISOString(),
    storyHash: line.storyCertifiedHash.trim(),
    certifiedByTechnicianId: line.storyCertifiedByTechnicianId,
  };
}

export function storyCertificationMatchesStory(
  certification: StoryCertificationState | null | undefined,
  storyText: string | undefined | null
): boolean {
  if (!certification) return false;
  const story = storyText?.trim() ?? '';
  if (!story) return false;
  return certification.storyHash === hashWarrantyStory(story);
}

export function buildStoryCertificationDbFields(input: {
  certifiedAt: Date;
  certifiedByTechnicianId: string;
  certifiedByName: string;
  storyHash: string;
}) {
  return {
    storyCertifiedAt: input.certifiedAt,
    storyCertifiedByTechnicianId: input.certifiedByTechnicianId,
    storyCertifiedByNameEncrypted: encryptPII(input.certifiedByName.trim()),
    storyCertifiedHash: input.storyHash,
  };
}

export function mapStoryCertificationToRepairLine(
  line: RepairLine,
  certification: StoryCertificationState | null
): RepairLine {
  if (!certification || !storyCertificationMatchesStory(certification, line.warrantyStory)) {
    return { ...line, storyCertification: null };
  }
  return { ...line, storyCertification: certification };
}