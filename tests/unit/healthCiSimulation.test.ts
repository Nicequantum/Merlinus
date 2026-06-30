import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  aggregateAuthenticatedHealthStatus,
  checkGrokApiConnectivity,
  checkKvStore,
  resolveAuthenticatedHealthHttpStatus,
} from '@/lib/healthChecks';
import { isProductionEnv } from '@/lib/rate-limit';

describe('health CI simulation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'production';
    process.env.CI = 'true';
    process.env.GROK_API_KEY = 'ci-grok-key';
    process.env.SESSION_SECRET = 'ci-test-session-secret-min-32-chars';
    process.env.ENCRYPTION_KEY =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.NEXT_PUBLIC_GROK_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    mock.restoreAll();
  });

  it('treats NODE_ENV=test as non-production even when VERCEL_ENV=production', () => {
    assert.equal(isProductionEnv(), false);
  });

  it('returns warn for fake Grok key HTTP 400 and keeps HTTP 200 aggregate', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('bad key', { status: 400 }));

    const grok = await checkGrokApiConnectivity();
    assert.equal(grok.status, 'warn');

    const kv = await checkKvStore();
    assert.equal(kv.status, 'warn');

    const checks = {
      database: { status: 'ok' as const },
      encryption: { status: 'ok' as const },
      kv,
      grokConfig: { status: 'ok' as const },
      grok,
      voice: { status: 'ok' as const },
      maintenance: { status: 'ok' as const },
    };

    assert.equal(aggregateAuthenticatedHealthStatus(checks), 'degraded');
    assert.equal(resolveAuthenticatedHealthHttpStatus(checks), 200);
  });
});