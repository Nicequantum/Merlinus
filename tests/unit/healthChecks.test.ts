import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  aggregateAuthenticatedHealthStatus,
  aggregateHealthStatus,
  buildHealthServicesPayload,
  toHealthServiceStatus,
} from '@/lib/healthChecks';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('enterprise health checks', () => {
  it('aggregates error over warn over ok', () => {
    assert.equal(
      aggregateHealthStatus({
        database: { status: 'ok' },
        kv: { status: 'warn' },
      }),
      'degraded'
    );
    assert.equal(
      aggregateHealthStatus({
        database: { status: 'ok' },
        encryption: { status: 'error' },
      }),
      'error'
    );
  });

  it('authenticated health returns 503 only for critical failures', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    assert.equal(
      aggregateAuthenticatedHealthStatus({
        database: { status: 'ok' },
        kv: { status: 'warn' },
        grok: { status: 'warn' },
      }),
      'degraded'
    );
    assert.equal(
      aggregateAuthenticatedHealthStatus({
        database: { status: 'error' },
        grok: { status: 'warn' },
      }),
      'error'
    );
    assert.equal(
      aggregateAuthenticatedHealthStatus({
        database: { status: 'ok' },
        encryption: { status: 'error' },
        grok: { status: 'warn' },
      }),
      'degraded'
    );

    process.env.NODE_ENV = 'production';
    assert.equal(
      aggregateAuthenticatedHealthStatus({
        database: { status: 'ok' },
        kv: { status: 'error' },
        grok: { status: 'warn' },
      }),
      'error'
    );

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('builds monitoring payload without internal detail strings', () => {
    const payload = buildHealthServicesPayload({
      database: { status: 'ok', latencyMs: 12, detail: 'secret diagnostics' },
      grok: { status: 'warn', detail: 'skipped' },
    });
    assert.deepEqual(payload.database, { status: 'ok', latencyMs: 12 });
    assert.deepEqual(payload.grok, { status: 'warn' });
    assert.equal(JSON.stringify(payload).includes('secret diagnostics'), false);
  });

  it('toHealthServiceStatus omits latency when absent', () => {
    assert.deepEqual(toHealthServiceStatus({ status: 'ok' }), { status: 'ok' });
  });

  it('health route probes critical services with Grok connectivity', () => {
    const route = readSrc('src/app/api/health/route.ts');
    const checks = readSrc('src/lib/healthChecks.ts');
    assert.ok(route.includes('buildHealthServicesPayload'));
    assert.ok(route.includes('logUnhealthyServices'));
    assert.ok(route.includes('aggregateAuthenticatedHealthStatus'));
    assert.ok(checks.includes('checkGrokApiConnectivity'));
    assert.ok(checks.includes('checkDatabase'));
    assert.ok(checks.includes('checkKvStore'));
    assert.ok(checks.includes('checkEncryption'));
    assert.ok(checks.includes('GROK_MODELS_URL'));
    assert.equal(checks.includes('chat/completions'), false);
  });
});