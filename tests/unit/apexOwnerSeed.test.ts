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
    assert.match(src, /OWNER_SEED_EMAIL_2/);
    assert.match(src, /OWNER_SEED_PASSWORD_2/);
    assert.match(src, /MULTI_ROOFTOP_SEED_USERNAME/);
    assert.match(src, /APEX_NATIONAL_DEALERSHIP_ID/);
    assert.match(src, /role: 'owner'/);
    assert.match(src, /d7Number: null/);
    assert.match(src, /upsertNationalOwnerAccount/);
    assert.match(src, /config\.owners/);
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
    const savedEmail2 = process.env.OWNER_SEED_EMAIL_2;
    const savedPassword2 = process.env.OWNER_SEED_PASSWORD_2;
    delete process.env.OWNER_SEED_EMAIL;
    delete process.env.OWNER_SEED_PASSWORD;
    delete process.env.OWNER_SEED_EMAIL_2;
    delete process.env.OWNER_SEED_PASSWORD_2;
    try {
      assert.equal(readApexOwnerSeedConfig(), null);
    } finally {
      if (savedEmail) process.env.OWNER_SEED_EMAIL = savedEmail;
      if (savedPassword) process.env.OWNER_SEED_PASSWORD = savedPassword;
      if (savedEmail2) process.env.OWNER_SEED_EMAIL_2 = savedEmail2;
      if (savedPassword2) process.env.OWNER_SEED_PASSWORD_2 = savedPassword2;
    }
  });

  test('readApexOwnerSeedConfig supports two national owners', () => {
    const saved = {
      e1: process.env.OWNER_SEED_EMAIL,
      p1: process.env.OWNER_SEED_PASSWORD,
      n1: process.env.OWNER_SEED_NAME,
      e2: process.env.OWNER_SEED_EMAIL_2,
      p2: process.env.OWNER_SEED_PASSWORD_2,
      n2: process.env.OWNER_SEED_NAME_2,
    };
    process.env.OWNER_SEED_EMAIL = 'owner.one@example.com';
    process.env.OWNER_SEED_PASSWORD = 'password-one';
    process.env.OWNER_SEED_NAME = 'Owner One';
    process.env.OWNER_SEED_EMAIL_2 = 'owner.two@example.com';
    process.env.OWNER_SEED_PASSWORD_2 = 'password-two';
    process.env.OWNER_SEED_NAME_2 = 'Owner Two';
    try {
      const config = readApexOwnerSeedConfig();
      assert.ok(config);
      assert.equal(config!.owners.length, 2);
      assert.equal(config!.owners[0].email, 'owner.one@example.com');
      assert.equal(config!.owners[1].email, 'owner.two@example.com');
      assert.equal(config!.owners[1].name, 'Owner Two');
    } finally {
      for (const [key, value] of Object.entries({
        OWNER_SEED_EMAIL: saved.e1,
        OWNER_SEED_PASSWORD: saved.p1,
        OWNER_SEED_NAME: saved.n1,
        OWNER_SEED_EMAIL_2: saved.e2,
        OWNER_SEED_PASSWORD_2: saved.p2,
        OWNER_SEED_NAME_2: saved.n2,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('second seed rooftop id is stable for integration tests', () => {
    assert.equal(APEX_SEED_SECOND_DEALERSHIP_ID, 'seed-dealership-2');
  });
});