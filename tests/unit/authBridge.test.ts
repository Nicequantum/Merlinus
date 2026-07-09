import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSessionPayloadFromTechnician } from '../../src/lib/auth';

describe('auth bridge session payload (Phase 4 PR-1)', () => {
  test('buildSessionPayloadFromTechnician maps technician row to SessionPayload', () => {
    const payload = buildSessionPayloadFromTechnician({
      id: 'tech-1',
      d7Number: 'D7HARRIH',
      name: 'Harris',
      role: 'technician',
      isAdmin: false,
      dealershipId: 'dealer-1',
      dealerId: 'apex-franchise',
      serviceAdvisorId: null,
      sessionVersion: 2,
      consentAt: new Date('2026-01-01T00:00:00.000Z'),
      consentVersion: 'v1',
      legalDisclaimerAt: null,
      legalDisclaimerVersion: null,
      dealership: { name: 'Merlinus Tiverton', dealerId: null },
    });

    assert.equal(payload.technicianId, 'tech-1');
    assert.equal(payload.d7Number, 'D7HARRIH');
    assert.equal(payload.dealershipId, 'dealer-1');
    assert.equal(payload.dealerId, 'apex-franchise');
    assert.equal(payload.sessionVersion, 2);
    assert.equal(payload.consentAt, '2026-01-01T00:00:00.000Z');
    assert.equal(payload.dealershipName, 'Merlinus Tiverton');
  });

  test('buildSessionPayloadFromTechnician inherits dealership dealerId when technician has none', () => {
    const payload = buildSessionPayloadFromTechnician({
      id: 'tech-2',
      d7Number: 'D7ADMIN',
      name: 'Admin',
      role: 'manager',
      isAdmin: true,
      dealershipId: 'dealer-1',
      dealerId: null,
      serviceAdvisorId: null,
      sessionVersion: 0,
      consentAt: null,
      consentVersion: null,
      legalDisclaimerAt: null,
      legalDisclaimerVersion: null,
      dealership: { name: 'Merlinus', dealerId: 'dealer-franchise' },
    });

    assert.equal(payload.dealerId, 'dealer-franchise');
  });
});