import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeAdaptiveConfidenceThreshold, passesConfidenceGate } from '../../src/lib/voice/confidence';
import { resolveVoiceErrorMessage, shouldAutoRestartAfterError } from '../../src/lib/voice/errors';
import { DEFAULT_VOICE_INPUT_SETTINGS } from '../../src/lib/voice/voiceSettings';

describe('voice confidence adaptation', () => {
  test('lowers threshold as noise increases', () => {
    const quiet = computeAdaptiveConfidenceThreshold(5, DEFAULT_VOICE_INPUT_SETTINGS);
    const loud = computeAdaptiveConfidenceThreshold(90, DEFAULT_VOICE_INPUT_SETTINGS);
    assert.ok(loud < quiet);
    assert.equal(loud, DEFAULT_VOICE_INPUT_SETTINGS.minConfidenceThreshold);
  });

  test('never drops below configured floor', () => {
    const threshold = computeAdaptiveConfidenceThreshold(100, DEFAULT_VOICE_INPUT_SETTINGS);
    assert.equal(threshold, DEFAULT_VOICE_INPUT_SETTINGS.minConfidenceThreshold);
  });

  test('M19: null or zero confidence accepted for live dictation', () => {
    assert.equal(passesConfidenceGate(undefined, 0.9, 0), true);
    assert.equal(passesConfidenceGate(null, 0.9, 5), true);
    assert.equal(passesConfidenceGate(0, 0.9, 0), true);
  });

  test('gates low-confidence hypotheses in quiet bays', () => {
    assert.equal(passesConfidenceGate(0.8, 0.55), true);
    assert.equal(passesConfidenceGate(0.1, 0.55), false);
  });
});

describe('voice error recovery', () => {
  test('maps technician-friendly messages', () => {
    assert.match(resolveVoiceErrorMessage('not-allowed'), /Microphone blocked/i);
    assert.match(resolveVoiceErrorMessage('network'), /network/i);
  });

  test('auto-restarts only for recoverable errors within cap', () => {
    assert.equal(shouldAutoRestartAfterError('no-speech', 0, 10), true);
    assert.equal(shouldAutoRestartAfterError('network', 2, 10), true);
    assert.equal(shouldAutoRestartAfterError('aborted', 0, 10), false);
    assert.equal(shouldAutoRestartAfterError('not-allowed', 0, 10), false);
    assert.equal(shouldAutoRestartAfterError('no-speech', 10, 10), false);
  });
});