import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  canAccessNationalConsole,
  requireOwnerNationalScope,
  DealershipScopeRequiredError,
} from '../../src/lib/apex/tenantScope';
import { APEX_NATIONAL_DEALERSHIP_ID } from '../../src/lib/apex/platformConstants';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Phase 6.3 security expansion', () => {
  it('requireOwnerNationalScope blocks dealership-scoped owners', () => {
    const prev = process.env.PLATFORM_MODE;
    process.env.PLATFORM_MODE = 'apex';
    try {
      const national = {
        role: 'owner',
        dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
        dealerId: null as string | null,
        scopeMode: 'national' as const,
        isOwner: true,
      };
      assert.equal(canAccessNationalConsole(national), true);
      assert.doesNotThrow(() => requireOwnerNationalScope(national));

      const inRooftop = {
        role: 'owner',
        dealershipId: 'seed-dealership',
        dealerId: null as string | null,
        scopeMode: 'dealership' as const,
        activeDealershipId: 'seed-dealership',
        isOwner: true,
      };
      assert.equal(canAccessNationalConsole(inRooftop), false);
      assert.throws(
        () => requireOwnerNationalScope(inRooftop),
        (err: unknown) => err instanceof DealershipScopeRequiredError
      );
    } finally {
      if (prev === undefined) delete process.env.PLATFORM_MODE;
      else process.env.PLATFORM_MODE = prev;
    }
  });

  it('owner national routes require requireOwnerNational', () => {
    const summary = readSrc('src/app/api/owner/summary/route.ts');
    const dealerships = readSrc('src/app/api/owner/dealerships/route.ts');
    assert.match(summary, /requireOwnerNational:\s*true/);
    assert.match(dealerships, /requireOwnerNational:\s*true/);
  });

  it('select-dealership uses fail-closed audit and refresh revoke', () => {
    const src = readSrc('src/app/api/auth/select-dealership/route.ts');
    assert.match(src, /writeAuditedAccess/);
    assert.match(src, /revokeApexRefreshForScopeSwitch/);
  });

  it('upload and sold-metrics use writeAuditedAccess', () => {
    const upload = readSrc('src/app/api/upload/route.ts');
    const sold = readSrc('src/app/api/repair-orders/[id]/lines/[lineId]/sold-metrics/route.ts');
    assert.match(upload, /writeAuditedAccess/);
    assert.match(sold, /writeAuditedAccess/);
    assert.match(sold, /getRlsDb/);
  });

  it('password reset uses fortress credential revoke', () => {
    const src = readSrc('src/app/api/users/[id]/password/route.ts');
    assert.match(src, /revokeSessionsAfterCredentialChange/);
    assert.match(src, /writeAuditedAccess/);
  });

  it('security fortress integration suite exists', () => {
    const src = readSrc('tests/integration/security-fortress.test.ts');
    assert.match(src, /Security fortress \(Phase 6\.3\)/);
    assert.match(src, /DEALERSHIP_CONTEXT_REQUIRED/);
    assert.match(src, /requireOwnerNational|national summary/);
  });
});
