import type { StoryQualityResult } from '@/types';

/** True when the panel score still reflects the story text on screen. */
export function isStoryQualityCurrent(quality: StoryQualityResult, storyText: string): boolean {
  const baseline = quality.scoredAgainstStory?.trim();
  const current = storyText.trim();
  if (!baseline || !current) return false;
  return baseline === current;
}