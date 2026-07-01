import 'server-only';

import { decryptJsonObject } from '@/lib/encryption';
import { hashWarrantyStory } from '@/lib/storyHash';
import { isStoryQualityCurrent } from '@/lib/storyQualityState';
import { prisma } from '@/lib/db';
import type { StoryQualityResult } from '@/types';

/** Durable audit actions that prove an MI score was run for a specific story version. */
export const STORY_MI_SCORE_AUDIT_ACTIONS = ['story.score', 'story.review'] as const;

export type StoryMiScoreAuditAction = (typeof STORY_MI_SCORE_AUDIT_ACTIONS)[number];

export type StoryCertificationGateFailureReason =
  | 'missing_generate_audit'
  | 'missing_quality_audit'
  | 'parse_failed'
  | 'stale_quality_audit'
  | 'missing_score_audit_log'
  | 'story_hash_mismatch';

export interface StoryCertificationGateResult {
  ok: boolean;
  reason?: StoryCertificationGateFailureReason;
  message: string;
  storyHash?: string;
  quality?: StoryQualityResult;
}

export function parseStoredStoryQualityAudit(
  encrypted: string | null | undefined
): StoryQualityResult | null {
  if (!encrypted?.trim()) return null;
  const parsed = decryptJsonObject<StoryQualityResult | null>(encrypted, null);
  if (!parsed || typeof parsed.score !== 'number') return null;
  return parsed;
}

export function parseAuditLogMetadata(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** True when audit metadata binds to the same CDK-normalized story hash as certification. */
export function auditMetadataMatchesStoryHash(
  metadataRaw: string,
  storyHash: string
): boolean {
  const meta = parseAuditLogMetadata(metadataRaw);
  const metaHash = meta.storyHash;
  return typeof metaHash === 'string' && metaHash.trim() === storyHash;
}

async function findMatchingMiScoreAuditLog(
  dealershipId: string,
  repairLineId: string,
  storyHash: string
): Promise<boolean> {
  const logs = await prisma.auditLog.findMany({
    where: {
      dealershipId,
      entityType: 'repairLine',
      entityId: repairLineId,
      action: { in: [...STORY_MI_SCORE_AUDIT_ACTIONS] },
      entryHash: { not: '' },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { metadata: true },
  });

  return logs.some((log) => auditMetadataMatchesStoryHash(log.metadata, storyHash));
}

/**
 * Server-side certification prerequisites — non-bypassable compliance gate.
 * Requires a current persisted MI quality audit and a matching durable score/review audit log.
 */
export async function validateStoryCertificationPrerequisites(input: {
  dealershipId: string;
  repairLineId: string;
  /** CDK-sanitized warranty story text submitted for certification. */
  warrantyStory: string;
}): Promise<StoryCertificationGateResult> {
  const storyHash = hashWarrantyStory(input.warrantyStory);

  if (!input.warrantyStory.trim()) {
    return {
      ok: false,
      reason: 'story_hash_mismatch',
      message: 'Warranty story text is required for certification.',
      storyHash,
    };
  }

  const hasGenerateAudit = await prisma.auditLog.findFirst({
    where: {
      dealershipId: input.dealershipId,
      entityType: 'repairLine',
      entityId: input.repairLineId,
      action: 'story.generate',
      entryHash: { not: '' },
    },
    select: { id: true },
  });
  if (!hasGenerateAudit) {
    return {
      ok: false,
      reason: 'missing_generate_audit',
      message: 'Only AI-generated warranty stories require technician certification.',
      storyHash,
    };
  }

  const dbLine = await prisma.repairLine.findFirst({
    where: {
      id: input.repairLineId,
      repairOrder: { dealershipId: input.dealershipId },
    },
    select: { storyQualityAuditEncrypted: true },
  });

  const quality = parseStoredStoryQualityAudit(dbLine?.storyQualityAuditEncrypted);
  if (!quality) {
    return {
      ok: false,
      reason: 'missing_quality_audit',
      message: 'Run Audit Story on the current warranty narrative before certifying.',
      storyHash,
    };
  }

  if (quality.parseFailed) {
    return {
      ok: false,
      reason: 'parse_failed',
      message: 'The last MI audit could not be read. Tap Audit Story again before certifying.',
      storyHash,
      quality,
    };
  }

  if (!isStoryQualityCurrent(quality, input.warrantyStory)) {
    return {
      ok: false,
      reason: 'stale_quality_audit',
      message:
        'The warranty story changed after the last audit. Tap Audit Story again, then complete certification.',
      storyHash,
      quality,
    };
  }

  const hasScoreAuditLog = await findMatchingMiScoreAuditLog(
    input.dealershipId,
    input.repairLineId,
    storyHash
  );
  if (!hasScoreAuditLog) {
    return {
      ok: false,
      reason: 'missing_score_audit_log',
      message: 'No MI audit record found for this story version. Tap Audit Story before certifying.',
      storyHash,
      quality,
    };
  }

  const qualityStoryHash = hashWarrantyStory(quality.scoredAgainstStory ?? input.warrantyStory);
  if (qualityStoryHash !== storyHash) {
    return {
      ok: false,
      reason: 'story_hash_mismatch',
      message: 'MI audit does not match the story being certified. Tap Audit Story again.',
      storyHash,
      quality,
    };
  }

  return {
    ok: true,
    message: 'Certification prerequisites satisfied.',
    storyHash,
    quality,
  };
}