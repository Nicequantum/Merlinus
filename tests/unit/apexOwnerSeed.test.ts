import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, test } from 'node:test';
import {
  readApexOwnerSeedConfig,
  APEX_SEED_SECOND_DEALERSHIP_ID,
} from '../../src/lib/apex/seedOwnerAccounts';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Apex owner seed (Phase 5.10)', () => {
  it('seedOwnerAccounts uses env vars and national sentinel FK', () => {
    const src = readSrc('src/lib/apex/seedOwnerAccounts.ts');
    assert.match(src, /OWNER_SEED_EMAIL/);
    assert.match(src, /OWNER_SEED_PASSWORD/);
    assert.match(src, /MULTI_ROOFTOP_SEED_USERNAME/);
    assert.match(src, /APEX_NATIONAL_DEALERSHIP_ID/);
    assert.match(src, /role: 'owner'/);
    assert.match(src, /d7Number: null/);
    assert.match(src, /where: \{ email: config\.ownerEmail \}/);
    assert.match(src, /where: \{ email: multiEmail \}/);
    assert.doesNotMatch(src, /where: \{ apexUsername:/);
  });

  it('seedDatabase wires optional apex owner seed', () => {
    const src = readSrc('src/lib/seedDatabase.ts');
    assert.match(src, /runApexOwnerSeedIfConfigured/);
    assert.match(src, /ownerEmail/);
  });

  it('.env.example documents owner seed variables', () => {
    const env = readSrc('.env.example');
    assert.match(env, /OWNER_SEED_EMAIL/);
    assert.match(env, /OWNER_SEED_PASSWORD/);
    assert.match(env, /MULTI_ROOFTOP_SEED_USERNAME/);
  });

  it('integration suite covers owner login, summary, enter/exit, multi-rooftop', () => {
    const src = readSrc('tests/integration/apex-owner-flows.test.ts');
    assert.match(src, /INTEGRATION_OWNER_EMAIL/);
    assert.match(src, /getOwnerSummary/);
    assert.match(src, /postEnterDealership/);
    assert.match(src, /postExitDealership/);
    assert.match(src, /requiresDealershipSelection/);
    assert.match(src, /DEALERSHIP_CONTEXT_REQUIRED/);
  });

  test('readApexOwnerSeedConfig returns null when owner env is unset', () => {
    const savedEmail = process.env.OWNER_SEED_EMAIL;
    const savedPassword = process.env.OWNER_SEED_PASSWORD;
    delete process.env.OWNER_SEED_EMAIL;
    delete process.env.OWNER_SEED_PASSWORD;
    try {
      assert.equal(readApexOwnerSeedConfig(), null);
    } finally {
      if (savedEmail) process.env.OWNER_SEED_EMAIL = savedEmail;
      if (savedPassword) process.env.OWNER_SEED_PASSWORD = savedPassword;
    }
  });

  test('second seed rooftop id is stable for integration tests', () => {
    assert.equal(APEX_SEED_SECOND_DEALERSHIP_ID, 'seed-dealership-2');
  });
});