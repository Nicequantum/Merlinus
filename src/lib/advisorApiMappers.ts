import type { AdvisorListItem, AdvisorPerformanceMetrics, AdvisorProfileData } from '@/types';
import { readAdvisorDisplayNameFromDb } from '@/lib/piiFieldRead';

type AdvisorWithProfile = {
  id: string;
  displayNameEncrypted?: string;
  advisorCode: string | null;
  status: string;
  roCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  csiScore: number | null;
  profile: {
    observationCount: number;
    lastComputedAt: Date | null;
    profileData: string;
  } | null;
};

export function parseAdvisorProfileSummary(profileData: string | undefined | null): {
  typicallyAllCaps: boolean;
  commonPhraseCount: number;
} {
  if (!profileData) {
    return { typicallyAllCaps: false, commonPhraseCount: 0 };
  }
  try {
    const data = JSON.parse(profileData) as {
      formatting?: { typicallyAllCaps?: boolean };
      commonPhrases?: unknown[];
    };
    return {
      typicallyAllCaps: Boolean(data.formatting?.typicallyAllCaps),
      commonPhraseCount: data.commonPhrases?.length ?? 0,
    };
  } catch {
    return { typicallyAllCaps: false, commonPhraseCount: 0 };
  }
}

export function mapAdvisorListItem(
  advisor: AdvisorWithProfile,
  metrics: AdvisorPerformanceMetrics
): AdvisorListItem {
  const { typicallyAllCaps, commonPhraseCount } = parseAdvisorProfileSummary(advisor.profile?.profileData);

  return {
    id: advisor.id,
    displayName: readAdvisorDisplayNameFromDb(advisor),
    advisorCode: advisor.advisorCode,
    status: advisor.status as 'active' | 'inactive',
    roCount: advisor.roCount,
    firstSeenAt: advisor.firstSeenAt.toISOString(),
    lastSeenAt: advisor.lastSeenAt.toISOString(),
    createdAt: advisor.createdAt.toISOString(),
    observationCount: advisor.profile?.observationCount ?? 0,
    profileUpdatedAt: advisor.profile?.lastComputedAt?.toISOString() ?? null,
    typicallyAllCaps,
    commonPhraseCount,
    metrics,
  };
}

export function parseAdvisorProfileData(raw: string | null | undefined): AdvisorProfileData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdvisorProfileData;
  } catch {
    return null;
  }
}