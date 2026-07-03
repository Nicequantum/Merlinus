import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Low priority audit fixes (L1–L5)', () => {
  it('L1: SSO/MFA documented as Phase 1 accepted risk with compensating controls', () => {
    const auth = readSrc('src/lib/auth.ts');
    assert.ok(auth.includes('Phase 1 accepted risk'));
    assert.ok(auth.includes('bcrypt'));
    assert.ok(auth.includes('sessionVersion'));
    assert.ok(auth.includes('Planned Phase 2'));
  });

  it('L2: public /api/status does not expose grokConfigured', () => {
    const status = readSrc('src/app/api/status/route.ts');
    assert.equal(status.includes('grokConfigured'), false);
    assert.equal(status.includes('isGrokConfigured'), false);
    assert.ok(status.includes('maintenance'));
    assert.ok(status.includes('voiceEnabled'));
  });

  it('L3: deprecated filteredROs export removed from useRepairOrders', () => {
    const src = readSrc('src/hooks/useRepairOrders.ts');
    assert.equal(src.includes('filteredROs'), false);
    assert.ok(src.includes('todayROs'));
    assert.ok(src.includes('searchROs'));
  });

  it('L4: reencryption runbook documents legacy migration and key rotation steps', () => {
    const runbook = readSrc('docs/Reencryption-Runbook.md');
    const encryption = readSrc('src/lib/encryption.ts');
    const reencrypt = readSrc('scripts/reencrypt-legacy-data.ts');
    assert.ok(runbook.includes('npm run db:reencrypt'));
    assert.ok(runbook.includes('Key rotation'));
    assert.ok(runbook.includes('DATA_ENCRYPTION_KEY'));
    assert.ok(runbook.includes('SEARCH_HMAC_KEY'));
    assert.ok(encryption.includes('Phase 1 accepted risk'));
    assert.ok(encryption.includes('db:reencrypt'));
    assert.ok(reencrypt.includes('Phase 1 accepted risk'));
    assert.ok(existsSync(resolve(root, 'scripts/reencrypt-legacy-data.ts')));
  });

  it('L5: Xentry cancel aborts analysis without wiping auto-saved photos', () => {
    const xentry = readSrc('src/hooks/repairOrders/useROXentryScan.ts');
    const scan = readSrc('src/hooks/repairOrders/useROScan.ts');
    const cancelBlock = xentry.slice(xentry.indexOf('const cancelProcessing'));
    assert.ok(cancelBlock.includes('abortControllerRef'));
    assert.ok(cancelBlock.includes('Diagnostic processing cancelled'));
    assert.equal(cancelBlock.includes('setPendingByKey'), false);
    assert.ok(scan.includes('setPendingROImages([])'));
  });

  it('pre-rollout validation separates code issues from config/env issues', () => {
    const script = readSrc('scripts/pre-rollout-validation.ts');
    assert.ok(script.includes("type CheckKind = 'code' | 'config'"));
    assert.ok(script.includes('CODE ISSUES'));
    assert.ok(script.includes('CONFIG / ENV ISSUES'));
    assert.ok(script.includes('inferCheckKind'));
  });

  it('obsolete IMPROVED_CODE_STRUCTURE.md marked deprecated', () => {
    const doc = readSrc('IMPROVED_CODE_STRUCTURE.md');
    assert.ok(doc.includes('Deprecated'));
    assert.equal(doc.includes('App.tsx (THE core'), false);
  });
});