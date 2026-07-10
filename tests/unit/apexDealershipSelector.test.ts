import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('ApexDealershipSelector (Phase 5.8)', () => {
  it('includes searchable list, primary badge, and remember default', () => {
    const src = readSrc('src/components/apex/ApexDealershipSelector.tsx');
    assert.match(src, /apex-dealership-search/);
    assert.match(src, /apex-dealership-primary-badge/);
    assert.match(src, /rememberAsDefault/);
    assert.match(src, /showRememberDefault/);
    assert.match(src, /filterApexDealerships/);
  });

  it('ApexLoginShell integrates selector with pending token flow', () => {
    const shell = readSrc('src/components/apex/ApexLoginShell.tsx');
    assert.match(shell, /ApexDealershipSelector/);
    assert.match(shell, /rememberAsDefault/);
    assert.match(shell, /pendingToken/);
  });

  it('ApexOwnerNationalShell wires enter dealership CTA and flow', () => {
    const shell = readSrc('src/components/apex/ApexOwnerNationalShell.tsx');
    assert.match(shell, /Enter dealership/);
    assert.match(shell, /fetchOwnerDealerships/);
    assert.match(shell, /enterOwnerDealership/);
    assert.match(shell, /ApexDealershipSelector/);
  });

  it('apexLoginSession passes rememberAsDefault to select-dealership', () => {
    const session = readSrc('src/lib/apexLoginSession.ts');
    assert.match(session, /rememberAsDefault/);
    assert.match(session, /select-dealership/);
    assert.match(session, /enter-dealership/);
    assert.match(session, /owner\/dealerships/);
  });

  it('owner dealerships API is owner-gated in apex mode', () => {
    const route = readSrc('src/app/api/owner/dealerships/route.ts');
    assert.match(route, /requireOwner/);
    assert.match(route, /isApexPlatformMode/);
    assert.match(route, /APEX_NATIONAL_DEALERSHIP_ID/);
  });
});