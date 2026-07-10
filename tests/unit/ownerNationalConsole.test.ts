import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, test } from 'node:test';
import {
  formatOwnerActivityAction,
  formatOwnerActivityTime,
} from '../../src/components/apex/formatOwnerActivity';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Owner national console (Phase 5.9)', () => {
  it('owner summary API returns aggregates without PII fields', () => {
    const lib = readSrc('src/lib/apex/ownerNationalSummary.ts');
    assert.match(lib, /dealerCount/);
    assert.match(lib, /dealershipCount/);
    assert.match(lib, /activeUsers/);
    assert.match(lib, /repairOrdersLast7Days/);
    assert.match(lib, /recentActivity/);
    assert.equal(lib.includes('technicianName'), false);
    assert.equal(lib.includes('metadata'), false);
    assert.equal(lib.includes('roNumber'), false);
  });

  it('GET /api/owner/summary is owner-gated and audits national access', () => {
    const route = readSrc('src/app/api/owner/summary/route.ts');
    assert.match(route, /getOwnerNationalSummary/);
    assert.match(route, /requireOwner/);
    assert.match(route, /owner\.national_access/);
    assert.match(route, /isApexPlatformMode/);
  });

  it('ApexOwnerNationalShell renders dashboard metrics and enter flow', () => {
    const shell = readSrc('src/components/apex/ApexOwnerNationalShell.tsx');
    assert.match(shell, /fetchOwnerNationalSummary/);
    assert.match(shell, /apex-stat-grid/);
    assert.match(shell, /apex-activity-feed/);
    assert.match(shell, /ApexDealershipSelector/);
    assert.match(shell, /Enter dealership/);
  });

  it('owner dealership workspace exposes exit to national', () => {
    const workspace = readSrc('src/components/apex/ApexOwnerDealershipWorkspace.tsx');
    assert.match(workspace, /exitOwnerDealership/);
    assert.match(workspace, /ApexOwnerDealershipBar/);
    const bar = readSrc('src/components/apex/ApexOwnerDealershipBar.tsx');
    assert.match(bar, /Exit to national/);
  });

  it('ApexPlatformApp routes owner dealership scope through workspace', () => {
    const app = readSrc('src/components/apex/ApexPlatformApp.tsx');
    assert.match(app, /isOwnerDealershipScope/);
    assert.match(app, /ApexOwnerDealershipWorkspace/);
  });

  test('formatOwnerActivityAction humanizes known actions', () => {
    assert.equal(formatOwnerActivityAction('owner.national_access'), 'National console viewed');
    assert.equal(formatOwnerActivityAction('custom.action'), 'custom · action');
  });

  test('formatOwnerActivityTime returns localized string', () => {
    const formatted = formatOwnerActivityTime('2026-07-09T15:30:00.000Z');
    assert.ok(formatted.length > 0);
  });
});