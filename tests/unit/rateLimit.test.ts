import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  checkRateLimit,
  isKvConfigured,
  RATE_LIMITS,
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
} from '@/lib/rate-limit';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function makeRequest(ip = '203.0.113.10', origin = 'http://localhost'): Request {
  return new Request(`${origin}/api/test`, {
    headers: { 'x-real-ip': ip },
  });
}

describe('rate limiting', () => {
  it('documents limits and production fail-closed behavior in source', () => {
    const src = readSrc('src/lib/rate-limit.ts');
    assert.ok(src.includes('RATE_LIMIT_UNAVAILABLE_MESSAGE'));
    assert.ok(src.includes('rate_limit.kv_unavailable'));
    assert.ok(src.includes('rate_limit.kv_required'));
    assert.ok(src.includes('rate_limit.check'));
    assert.ok(src.includes('isLocalhostRequest'));
    assert.ok(src.includes('NEVER_FAIL_CLOSED_ROUTE_KEYS'));
    assert.ok(src.includes("'auth.login'"));
    assert.equal(src.includes("logger.warn('rate_limit.kv_fallback'"), false);
    assert.ok(src.includes("logger.warn('rate_limit.kv_fallback_dev'"));
    assert.ok(src.includes('Distributed per-IP rate limiting'));
    assert.ok(RATE_LIMITS.auth.limit === 10);
    assert.ok(RATE_LIMITS.generate.limit === 20);
    assert.ok(RATE_LIMITS.upload.limit === 30);
    assert.ok(RATE_LIMITS.default.limit === 60);
  });

  it('allows dev traffic without KV using in-memory limits', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL_ENV;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      assert.equal(isKvConfigured(), false);
      const routeKey = `test.dev.${Date.now()}`;
      const result = await checkRateLimit(makeRequest(), routeKey, RATE_LIMITS.default);
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows local production start without KV using in-memory limits', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL_ENV;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      const routeKey = `test.local.prod.${Date.now()}`;
      const result = await checkRateLimit(makeRequest(), routeKey, RATE_LIMITS.auth);
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows local env with VERCEL_ENV=production when KV is unreachable', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'invalid-token';

    try {
      const routeKey = `test.pulled.env.${Date.now()}`;
      const result = await checkRateLimit(makeRequest(), routeKey, RATE_LIMITS.auth);
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows localhost login even on Vercel production runtime without KV', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      const routeKey = `test.localhost.vercel.${Date.now()}`;
      const result = await checkRateLimit(makeRequest(), routeKey, RATE_LIMITS.auth);
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows auth.login on Vercel production without KV on public hostname', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      const routeKey = 'auth.login';
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlinus.vercel.app'),
        routeKey,
        RATE_LIMITS.auth
      );
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows legal_disclaimer on Vercel production when KV is configured but unreachable', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'invalid-token';

    try {
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlinus.vercel.app'),
        'legal_disclaimer',
        RATE_LIMITS.default
      );
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows dashboard.summary on Vercel production when KV is configured but unreachable', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'invalid-token';

    try {
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlinus.vercel.app'),
        'dashboard.summary',
        RATE_LIMITS.default
      );
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows ros.list on Vercel production when KV is configured but unreachable', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'invalid-token';

    try {
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlinus.vercel.app'),
        'ros.list',
        RATE_LIMITS.default
      );
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('allows dashboard.summary on Vercel production without KV using in-memory limits', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlinus.vercel.app'),
        'dashboard.summary',
        RATE_LIMITS.default
      );
      assert.equal(result, null);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });

  it('fails closed on Vercel production when KV is configured but unreachable', async () => {
    const saved = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercel: process.env.VERCEL,
      ci: process.env.CI,
      githubActions: process.env.GITHUB_ACTIONS,
      kvUrl: process.env.KV_REST_API_URL,
      kvToken: process.env.KV_REST_API_TOKEN,
    };
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'invalid-token';

    try {
      const routeKey = `story.generate.${Date.now()}`;
      const result = await checkRateLimit(
        makeRequest('203.0.113.10', 'https://merlin.dealership.example'),
        routeKey,
        RATE_LIMITS.generate
      );
      assert.ok(result);
      assert.equal(result.status, 503);
      const body = (await result.json()) as { error?: string };
      assert.equal(body.error, RATE_LIMIT_UNAVAILABLE_MESSAGE);
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VERCEL_ENV = saved.vercelEnv;
      if (saved.vercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = saved.vercel;
      }
      if (saved.ci === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = saved.ci;
      }
      if (saved.githubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = saved.githubActions;
      }
      process.env.KV_REST_API_URL = saved.kvUrl;
      process.env.KV_REST_API_TOKEN = saved.kvToken;
    }
  });
});