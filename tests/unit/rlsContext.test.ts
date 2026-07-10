import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  isRlsEnabled,
  rlsContextFromSession,
} from '../../src/lib/apex/rlsContext';
import { APEX_NATIONAL_DEALERSHIP_ID } from '../../src/lib/apex/platformConstants';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Phase 6.1 RLS context', () => {
  it('isRlsEnabled reads RLS_ENABLED env', () => {
    const prev = process.env.RLS_ENABLED;
    try {
      delete process.env.RLS_ENABLED;
      assert.equal(isRlsEnabled(), false);
      process.env.RLS_ENABLED = 'true';
      assert.equal(isRlsEnabled(), true);
      process.env.RLS_ENABLED = '0';
      assert.equal(isRlsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.RLS_ENABLED;
      else process.env.RLS_ENABLED = prev;
    }
  });

  it('rlsContextFromSession uses dealership scope for technicians', () => {
    const ctx = rlsContextFromSession({
      technicianId: 'tech-1',
      role: 'technician',
      dealershipId: 'seed-dealership',
      dealerId: 'dealer-1',
      scopeMode: 'dealership',
      activeDealershipId: 'seed-dealership',
    });
    assert.equal(ctx.scopeMode, 'dealership');
    assert.equal(ctx.activeDealershipId, 'seed-dealership');
    assert.equal(ctx.dealerId, 'dealer-1');
    assert.equal(ctx.technicianId, 'tech-1');
  });

  it('rlsContextFromSession clears active rooftop for national owners', () => {
    const prev = process.env.PLATFORM_MODE;
    process.env.PLATFORM_MODE = 'apex';
    try {
      const ctx = rlsContextFromSession({
        technicianId: 'owner-1',
        role: 'owner',
        dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
        dealerId: null,
        scopeMode: 'national',
        isOwner: true,
      });
      assert.equal(ctx.scopeMode, 'national');
      assert.equal(ctx.activeDealershipId, null);
    } finally {
      if (prev === undefined) delete process.env.PLATFORM_MODE;
      else process.env.PLATFORM_MODE = prev;
    }
  });

  it('migration enables FORCE RLS on PII tables', () => {
    const sql = readSrc(
      'prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/migration.sql'
    );
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /RepairOrder/);
    assert.match(sql, /RepairLine/);
    assert.match(sql, /AuditLog/);
    assert.match(sql, /app\.rls_enforced/);
    assert.match(sql, /app\.rls_bypass/);
  });

  it('rlsContext module exports setRlsContext and withRlsContext', () => {
    const src = readSrc('src/lib/apex/rlsContext.ts');
    assert.match(src, /export async function setRlsContext/);
    assert.match(src, /export async function withRlsContext/);
    assert.match(src, /export async function withRlsBypass/);
    assert.match(src, /set_config/);
  });
});
