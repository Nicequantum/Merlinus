import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MI_AUDIT_GUIDELINES } from '@/prompts/miAuditGuidelines';
import {
  STORY_REVIEW_SYSTEM_PROMPT,
  STORY_SCORE_SYSTEM_PROMPT,
  gradeFromScore,
  parseStoryQualityResponse,
  parseStoryReviewResponse,
} from '@/prompts/storyQuality';

describe('MI 2.0 audit guidelines', () => {
  it('defines audit rewards and rejection triggers', () => {
    assert.match(MI_AUDIT_GUIDELINES, /Mercedes Intelligence 2\.0/i);
    assert.match(MI_AUDIT_GUIDELINES, /3 C's headers/i);
    assert.match(MI_AUDIT_GUIDELINES, /Fabricated data/i);
  });

  it('includes MI criteria in scoring and review prompts', () => {
    assert.match(STORY_SCORE_SYSTEM_PROMPT, /MI 2\.0/i);
    assert.match(STORY_REVIEW_SYSTEM_PROMPT, /priorityActions/i);
  });
});

describe('story quality parsing', () => {
  it('parses fenced JSON quality response', () => {
    const result = parseStoryQualityResponse(`\`\`\`json
{
  "score": 87,
  "grade": "strong",
  "summary": "Solid workflow with minor placeholder gaps.",
  "strengths": ["Clear 3 C's structure", "Evidence-linked cause"],
  "improvements": ["Add verification drive mileage"],
  "auditRisks": []
}
\`\`\``);
    assert.equal(result.score, 87);
    assert.equal(result.grade, 'strong');
    assert.equal(result.strengths.length, 2);
    assert.equal(result.auditRisks.length, 0);
  });

  it('parses review response with coaching feedback', () => {
    const result = parseStoryReviewResponse(
      JSON.stringify({
        score: 72,
        grade: 'needs-work',
        summary: 'Workflow gaps weaken audit defense.',
        strengths: ['Good technician voice'],
        improvements: ['Document final Quick Test'],
        auditRisks: ['Missing verification drive'],
        feedback: {
          structure: '3 C headers present but Cause runs long.',
          technicalDetail: 'Codes cited correctly.',
          clarity: 'Readable narrative.',
          workflow: 'Steps 8-10 need placeholders.',
          fabricationRisk: 'Low — no invented measurements.',
        },
        priorityActions: ['Add [NOT DOCUMENTED] for final Quick Test', 'Tighten Cause section'],
      })
    );
    assert.equal(result.score, 72);
    assert.equal(result.priorityActions.length, 2);
    assert.match(result.feedback.workflow, /Steps 8-10/);
  });

  it('maps grades from score when missing', () => {
    assert.equal(gradeFromScore(92), 'excellent');
    assert.equal(gradeFromScore(80), 'strong');
    assert.equal(gradeFromScore(65), 'needs-work');
    assert.equal(gradeFromScore(45), 'at-risk');
  });
});