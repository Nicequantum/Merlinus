import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('manual story audit workflow', () => {
  test('LineView exposes Audit Story button wired to score handler', () => {
    const lineView = readSrc('src/components/LineView.tsx');
    assert.match(lineView, /onScoreStory/);
    // Label comes from line.auditStory i18n key (EN catalog: "Audit Story")
    assert.match(lineView, /t\(['"]auditStory['"]\)|auditStory/);
    assert.match(readSrc('src/i18n/locales/en/line.json'), /"auditStory"\s*:\s*"Audit Story"/);
    assert.match(lineView, /isScoring/);
  });

  test('useROStoryWorkflow exports manual scoreStory and skips post-generate scoring', () => {
    const workflow = readSrc('src/hooks/repairOrders/useROStoryWorkflow.ts');
    assert.match(workflow, /const scoreStory = useCallback/);
    assert.match(workflow, /api\.scoreStory/);
    assert.doesNotMatch(workflow, /void \(async \(\) => \{[\s\S]*api\.scoreStory/);
    assert.match(workflow, /return \{[^}]*scoreStory/);
  });

  test('scoreStory acquires in-flight lock before flushPendingSave', () => {
    const workflow = readSrc('src/hooks/repairOrders/useROStoryWorkflow.ts');
    const scoreBlock = workflow.slice(workflow.indexOf('const scoreStory = useCallback'));
    const tryIdx = scoreBlock.indexOf('try {');
    const lockIdx = scoreBlock.indexOf('storyScoringInFlightRef.current = true');
    const flushIdx = scoreBlock.indexOf('flushPendingSave({ maxWaitMs: 2_500 })');
    assert.ok(lockIdx >= 0 && flushIdx >= 0 && tryIdx >= 0);
    assert.ok(lockIdx < flushIdx, 'scoring lock must be set before awaiting save flush');
    // Toast copy is i18n: story.scoreInProgress → "Story audit already in progress…"
    assert.match(scoreBlock, /scoreInProgress/);
    assert.match(
      readSrc('src/i18n/locales/en/story.json'),
      /"scoreInProgress"\s*:\s*"Story audit already in progress/
    );
  });

  test('reviewStory acquires in-flight lock before flushPendingSave', () => {
    const workflow = readSrc('src/hooks/repairOrders/useROStoryWorkflow.ts');
    const reviewBlock = workflow.slice(workflow.indexOf('const reviewStory = useCallback'));
    const lockIdx = reviewBlock.indexOf('storyReviewInFlightRef.current = true');
    const flushIdx = reviewBlock.indexOf('flushPendingSave({ maxWaitMs: 2_500 })');
    assert.ok(lockIdx >= 0 && flushIdx >= 0);
    assert.ok(lockIdx < flushIdx, 'review lock must be set before awaiting save flush');
    // Toast copy is i18n: story.reviewInProgress → "AI review already in progress…"
    assert.match(reviewBlock, /reviewInProgress/);
    assert.match(
      readSrc('src/i18n/locales/en/story.json'),
      /"reviewInProgress"\s*:\s*"AI review already in progress/
    );
  });

  test('quality loading panel separates generation from audit scoring', () => {
    const panel = readSrc('src/components/StoryQualityPanel.tsx');
    assert.match(panel, /mode === 'scoring'/);
    // Generation vs scoring titles come from distinct i18n keys
    assert.match(panel, /qualityLoadingGenerate/);
    assert.match(panel, /qualityLoadingScore/);
    assert.match(
      readSrc('src/i18n/locales/en/story.json'),
      /"qualityLoadingGenerate"/
    );
    assert.doesNotMatch(panel, /Generating story and scoring/i);
  });

  test('StoryQualityPanel wires Add All and per-detail apply actions', () => {
    const panel = readSrc('src/components/StoryQualityPanel.tsx');
    assert.match(panel, /onApplyTechnicianDetail/);
    assert.match(panel, /onApplyAllTechnicianDetails/);
    // Apply-all CTA is i18n qualityApplyAll (EN: "Add all corrections")
    assert.match(panel, /qualityApplyAll/);
    assert.match(readSrc('src/i18n/locales/en/story.json'), /"qualityApplyAll"/);
    assert.match(panel, /technicianDetailActionLabel/);
  });

  test('LineView wires tech-detail apply handlers into quality panel', () => {
    const lineView = readSrc('src/components/LineView.tsx');
    assert.match(lineView, /handleApplyTechnicianDetail/);
    assert.match(lineView, /handleApplyAllTechnicianDetails/);
    assert.match(lineView, /onApplyAllTechnicianDetails/);
    assert.match(lineView, /GENERATE_STORY_BUTTON_LABEL|MI_PRODUCT_LABEL|generateStory/);
    assert.doesNotMatch(lineView, /Generate MI 4\.3/);
  });
});
