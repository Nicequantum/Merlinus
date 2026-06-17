import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isStoryQualityCurrent } from '@/lib/storyQualityState';

describe('story quality state', () => {
  it('detects when scored baseline matches current story', () => {
    const quality = {
      score: 88,
      grade: 'strong' as const,
      strengths: [],
      improvements: [],
      auditRisks: [],
      summary: 'Good',
      scoredAgainstStory: 'Customer Complaint: noise\nCause: bearing',
    };
    assert.equal(isStoryQualityCurrent(quality, 'Customer Complaint: noise\nCause: bearing'), true);
    assert.equal(isStoryQualityCurrent(quality, 'Customer Complaint: noise\nCause: bearing\nExtra edit'), false);
  });
});