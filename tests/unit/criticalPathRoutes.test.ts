import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('critical path HTTP route coverage', () => {
  it('login route validates input, rate-limits, sets session cookie, and audits success', () => {
    const src = readSrc('src/app/api/auth/login/route.ts');
    assert.match(src, /parseRequestBody\(request, loginSchema/);
    assert.match(src, /checkRateLimit\(request, 'auth\.login'/);
    assert.match(src, /loginTechnician/);
    assert.match(src, /setSessionCookie/);
    assert.match(src, /action: 'auth\.login'/);
    assert.match(src, /logApiWriteRequest/);
    assert.equal(src.includes('withDbConnectionRetry'), false);
  });

  it('RO extract route enforces auth, image access, and Grok extraction without DB retry', () => {
    const src = readSrc('src/app/api/repair-orders/extract/route.ts');
    assert.match(src, /withAuth\(/);
    assert.match(src, /blockServiceAdvisorAi/);
    assert.match(src, /imagePathnamesSchema/);
    assert.match(src, /userCanAccessImage/);
    assert.match(src, /fetchPrivateBlobAsDataUrl/);
    assert.match(src, /extractROFromImages/);
    assert.match(src, /rateLimitKey: 'ro\.extract'/);
    assert.equal(src.includes('withDbConnectionRetry'), false);
  });

  it('generate-story route audits before persist and scopes updates by dealership', () => {
    const src = readSrc('src/app/api/repair-orders/[id]/lines/[lineId]/generate-story/route.ts');
    assert.match(src, /repairOrderLineParamsSchema/);
    assert.match(src, /generateWarrantyStory/);
    assert.match(src, /action: 'story\.generate'/);
    assert.match(src, /scopedRepairLineWhere/);
    assert.match(src, /warrantyStoryEncrypted/);

    const auditIdx = src.indexOf("action: 'story.generate'");
    const persistIdx = src.indexOf('prisma.repairLine.updateMany');
    assert.ok(auditIdx >= 0 && persistIdx >= 0);
    assert.ok(auditIdx < persistIdx, 'story.generate audit must precede DB persist');
    assert.equal(src.includes('withDbConnectionRetry'), false);
  });

  it('integration suite exercises login, RO extract, and story generate over HTTP', () => {
    const src = readSrc('tests/integration/critical-paths.test.ts');
    assert.match(src, /postLogin/);
    assert.match(src, /postExtract/);
    assert.match(src, /postGenerateStory/);
    assert.match(src, /auth\.login/);
    assert.match(src, /ro\.extract|repair-orders\/extract/);
    assert.match(src, /story\.generate/);
    assert.match(src, /criticalPathMocks/);
    assert.match(src, /runWithNextRouteContext/);
  });

  it('cookies intercept test guards the traced auth.ts next/headers import path', () => {
    const src = readSrc('tests/integration/cookies-intercept.test.ts');
    assert.match(src, /setSessionCookie/);
    assert.match(src, /getMockSessionCookie/);
    const mock = readSrc('tests/setup/cookiesMock.mjs');
    assert.match(mock, /next\/headers/);
    assert.match(mock, /\.\/dist\/server\/request\/cookies/);
  });
});