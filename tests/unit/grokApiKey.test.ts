import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('grok API key security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GROK_API_KEY;
    delete process.env.NEXT_PUBLIC_GROK_API_KEY;
    delete process.env.NEXT_PUBLIC_XAI_API_KEY;
    delete process.env.NEXT_PUBLIC_XAI_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('reads server-only GROK_API_KEY', async () => {
    process.env.GROK_API_KEY = 'xai-test-server-key';
    const { getGrokApiKey } = await import('../../src/lib/grokApiKey.shared');
    assert.equal(getGrokApiKey(), 'xai-test-server-key');
  });

  test('rejects NEXT_PUBLIC_GROK_API_KEY exposure', async () => {
    process.env.GROK_API_KEY = 'xai-test-server-key';
    process.env.NEXT_PUBLIC_GROK_API_KEY = 'xai-exposed-key';
    const { getGrokApiKey } = await import('../../src/lib/grokApiKey.shared');
    assert.throws(() => getGrokApiKey(), /NEXT_PUBLIC_GROK_API_KEY/);
  });

  test('detects all forbidden public env keys', async () => {
    process.env.NEXT_PUBLIC_XAI_API_KEY = 'xai-exposed-key';
    const { getExposedPublicGrokEnvKeys } = await import('../../src/lib/grokApiKey.shared');
    assert.deepEqual(getExposedPublicGrokEnvKeys(), ['NEXT_PUBLIC_XAI_API_KEY']);
  });
});