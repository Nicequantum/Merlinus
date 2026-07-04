import type { StoryCertificationRecord } from '@/hooks/repairOrders/useROStoryWorkflow';
import { isStoryQualityCurrent, storiesMatchForAudit } from '@/lib/storyQualityState';
import type { RepairLine, RepairOrder, StoryQualityResult, StoryReviewResult } from '@/types';

export interface CompanionLineStoryStateInput {
  ro: RepairOrder;
  activeLineId: string | null;
  storyQuality: StoryQualityResult | null;
  storyReview: StoryReviewResult | null;
  storyQualityStale: boolean;
  storyCertification: StoryCertificationRecord | null;
}

export interface CompanionLineStoryState {
  activeLine: RepairLine | null;
  storyQuality: StoryQualityResult | null;
  storyReview: StoryReviewResult | null;
  storyQualityStale: boolean;
  storyCertification: StoryCertificationRecord | null;
}

function certificationRecordFromLine(line: RepairLine): StoryCertificationRecord | null {
  const storyText = line.warrantyStory?.trim() ?? '';
  const certification = line.storyCertification;
  if (!storyText || !certification?.certifiedByName || !certification.certifiedAt) return null;
  return {
    certifiedByName: certification.certifiedByName,
    certifiedAt: certification.certifiedAt,
    storyText,
  };
}

function resolveCertificationForLine(
  line: RepairLine,
  fromHook: StoryCertificationRecord | null
): StoryCertificationRecord | null {
  const storyText = line.warrantyStory?.trim() ?? '';
  if (!storyText) return null;

  if (fromHook && storiesMatchForAudit(fromHook.storyText, storyText)) {
    return fromHook;
  }

  return certificationRecordFromLine(line);
}

function resolveQualityForLine(
  line: RepairLine,
  fromHook: StoryQualityResult | null
): StoryQualityResult | null {
  const storyText = line.warrantyStory?.trim() ?? '';
  const audit = line.storyQualityAudit;
  const candidate = fromHook ?? audit ?? null;
  if (!candidate) return null;

  if (storyText && isStoryQualityCurrent(candidate, storyText)) {
    return candidate;
  }

  const baseline = candidate.scoredAgainstStory?.trim() ?? '';
  if (baseline && isStoryQualityCurrent(candidate, baseline)) {
    return candidate;
  }

  return null;
}

function resolveQualityStale(
  line: RepairLine,
  quality: StoryQualityResult | null,
  fromHookStale: boolean
): boolean {
  if (!quality) return false;
  const storyText = line.warrantyStory?.trim() ?? '';
  if (!storyText) return fromHookStale;
  return fromHookStale || !isStoryQualityCurrent(quality, storyText);
}

/** Merge hook-level story state with persisted line fields for the desktop companion. */
export function deriveCompanionLineStoryState({
  ro,
  activeLineId,
  storyQuality,
  storyReview,
  storyQualityStale,
  storyCertification,
}: CompanionLineStoryStateInput): CompanionLineStoryState {
  const activeLine =
    (activeLineId ? ro.repairLines.find((line) => line.id === activeLineId) : null) ??
    ro.repairLines[0] ??
    null;

  if (!activeLine) {
    return {
      activeLine: null,
      storyQuality: null,
      storyReview: null,
      storyQualityStale: false,
      storyCertification: null,
    };
  }

  const resolvedQuality = resolveQualityForLine(activeLine, storyQuality);
  const resolvedCertification = resolveCertificationForLine(activeLine, storyCertification);

  return {
    activeLine,
    storyQuality: resolvedQuality,
    storyReview: resolvedQuality ? storyReview : null,
    storyQualityStale: resolveQualityStale(activeLine, resolvedQuality, storyQualityStale),
    storyCertification: resolvedCertification,
  };
}