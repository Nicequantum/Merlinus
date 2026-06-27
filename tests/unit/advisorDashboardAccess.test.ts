import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isServiceAdvisorUser,
  requireServiceAdvisorLink,
} from '@/lib/advisorDashboardAccess';

describe('advisorDashboardAccess', () => {
  it('detects service advisor users', () => {
    assert.equal(isServiceAdvisorUser({ role: 'service_advisor' }), true);
    assert.equal(isServiceAdvisorUser({ role: 'technician' }), false);
    assert.equal(isServiceAdvisorUser({ role: 'manager' }), false);
  });

  it('requires linked service advisor id', () => {
    assert.equal(
      requireServiceAdvisorLink({
        role: 'service_advisor',
        dealershipId: 'd1',
        technicianId: 't1',
        serviceAdvisorId: 'sa-1',
      }),
      'sa-1'
    );
    assert.equal(
      requireServiceAdvisorLink({
        role: 'technician',
        dealershipId: 'd1',
        technicianId: 't1',
        serviceAdvisorId: 'sa-1',
      }),
      null
    );
  });
});