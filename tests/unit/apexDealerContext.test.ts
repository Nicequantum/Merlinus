import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  APEX_DEALER_HEADER,
  MERLINUS_DEFAULT_DEALER_ID,
  getDealerIdFromRequest,
  getLegacyDefaultDealerId,
  resolveDealerContext,
  resolveDealerIdForWrite,
} from '../../src/lib/apex/dealerContext';
import { withOptionalDealerId } from '../../src/lib/apex/dealerScope';

describe('apex dealer context (Phase 1)', () => {
  test('getDealerIdFromRequest reads x-apex-dealer-id header', () => {
    const request = new Request('http://localhost/api/repair-orders', {
      headers: { [APEX_DEALER_HEADER]: 'dealer-abc' },
    });
    assert.equal(getDealerIdFromRequest(request), 'dealer-abc');
    assert.equal(getDealerIdFromRequest(), null);
  });

  test('resolveDealerContext prefers header over session', () => {
    const request = new Request('http://localhost', {
      headers: { [APEX_DEALER_HEADER]: 'header-dealer' },
    });
    const ctx = resolveDealerContext({
      session: { dealershipId: 'd1', dealerId: 'session-dealer' },
      request,
    });
    assert.equal(ctx.dealerId, 'header-dealer');
    assert.equal(ctx.source, 'header');
    assert.equal(ctx.dealershipId, 'd1');
  });

  test('resolveDealerContext uses session dealerId when header absent', () => {
    const ctx = resolveDealerContext({
      session: { dealershipId: 'd1', dealerId: 'session-dealer' },
    });
    assert.equal(ctx.dealerId, 'session-dealer');
    assert.equal(ctx.source, 'session');
  });

  test('resolveDealerContext falls back to legacy default for Merlinus', () => {
    const saved = process.env.APEX_DEFAULT_DEALER_ID;
    delete process.env.APEX_DEFAULT_DEALER_ID;

    const ctx = resolveDealerContext({
      session: { dealershipId: 'd1' },
    });
    assert.equal(ctx.dealerId, MERLINUS_DEFAULT_DEALER_ID);
    assert.equal(ctx.source, 'legacy_default');

    process.env.APEX_DEFAULT_DEALER_ID = saved;
  });

  test('getLegacyDefaultDealerId respects APEX_DEFAULT_DEALER_ID env', () => {
    const saved = process.env.APEX_DEFAULT_DEALER_ID;
    process.env.APEX_DEFAULT_DEALER_ID = 'custom-dealer';
    assert.equal(getLegacyDefaultDealerId(), 'custom-dealer');
    process.env.APEX_DEFAULT_DEALER_ID = saved;
  });

  test('resolveDealerIdForWrite prefers explicit session dealerId', () => {
    const id = resolveDealerIdForWrite({
      session: { dealershipId: 'd1', dealerId: 'write-dealer' },
    });
    assert.equal(id, 'write-dealer');
  });

  test('withOptionalDealerId is a no-op when dealerId is absent', () => {
    const where = { dealershipId: 'd1', technicianId: 't1' };
    assert.deepEqual(withOptionalDealerId(where, null), where);
    assert.deepEqual(withOptionalDealerId(where, ''), where);
  });

  test('withOptionalDealerId adds dealerId when provided', () => {
    const where = { dealershipId: 'd1' };
    assert.deepEqual(withOptionalDealerId(where, 'dealer-x'), {
      dealershipId: 'd1',
      dealerId: 'dealer-x',
    });
  });
});