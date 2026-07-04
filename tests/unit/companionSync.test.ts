import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('desktop companion sync', () => {
  it('keeps SSE connection stable without handler-driven reconnects', () => {
    const hook = readSrc('src/hooks/useCompanionSync.ts');
    assert.ok(hook.includes('handleEventRef'));
    assert.ok(hook.includes('handlersRef'));
    assert.ok(hook.includes('connectionGenerationRef'));
    assert.ok(hook.includes('}, [enabled]);'));
    assert.equal(hook.includes('}, [enabled, handleEvent]);'), false);
  });

  it('deduplicates status publishes and surfaces publish failures', () => {
    const hook = readSrc('src/hooks/useCompanionSync.ts');
    assert.ok(hook.includes('lastPublishedStatusRef'));
    assert.ok(hook.includes('if (!response.ok)'));
  });

  it('configures long-lived companion SSE route', () => {
    const route = readSrc('src/app/api/companion/stream/route.ts');
    assert.ok(route.includes('export const maxDuration = 300'));
    assert.ok(route.includes("'X-Accel-Buffering': 'no'"));
    assert.ok(route.includes('skipRateLimit: true'));
  });

  it('uses stable publish callbacks in CompanionSyncBridge effects', () => {
    const bridge = readSrc('src/components/CompanionSyncBridge.tsx');
    assert.ok(bridge.includes('const { publishNavigation, publishStatus } = companion;'));
    assert.equal(bridge.includes('[companion, enabled'), false);
  });

  it('mirrors audit and certification SSE events into live activity', () => {
    const hook = readSrc('src/hooks/useCompanionSync.ts');
    assert.ok(hook.includes('MI audit score:'));
    assert.ok(hook.includes('Story certified and saved'));
    assert.ok(hook.includes("event.sourceDeviceId === 'server'"));
  });

  it('merges companion story state from active line and persisted audit fields', () => {
    const layout = readSrc('src/components/desktop/DesktopCompanionLayout.tsx');
    const state = readSrc('src/lib/companionLineStoryState.ts');
    assert.ok(layout.includes('deriveCompanionLineStoryState'));
    assert.ok(layout.includes('activeLineId'));
    assert.ok(state.includes('resolveQualityForLine'));
    assert.ok(state.includes('resolveCertificationForLine'));
  });

  it('scores warranty stories with full-structure retry instead of throwing on parse failure', () => {
    const grok = readSrc('src/lib/grok.ts');
    const prompts = readSrc('src/prompts/storyQuality.ts');
    assert.ok(grok.includes('STORY_SCORE_RETRY_SYSTEM_PROMPT'));
    assert.ok(grok.includes('isStoryQualityDetailMissing'));
    assert.ok(grok.includes('grok.story.score_retry'));
    assert.ok(prompts.includes('strengths: 2-4 specific strengths'));
    assert.ok(prompts.includes('auditRisks: 1-4 critical MI 2.0 rejection risks'));
    assert.equal(grok.includes("throw new Error('AI quality score returned unreadable JSON.')"), false);
  });
});