import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { describe, it } from 'node:test';
import {
  CANONICAL_SEED_PASSWORD,
  PRIMARY_MANAGER_D7,
  PRIMARY_TECH_D7,
} from '@/lib/seedDatabase';

describe('seed database credentials', () => {
  it('defines canonical manager D7 and password for immediate login', () => {
    assert.equal(PRIMARY_MANAGER_D7, 'D7HARRIH');
    assert.equal(PRIMARY_TECH_D7, 'D7TECH001');
    assert.equal(CANONICAL_SEED_PASSWORD, 'password123');
  });

  it('uses bcrypt hash compatible with loginTechnician verification', async () => {
    const hash = await bcrypt.hash(CANONICAL_SEED_PASSWORD, 12);
    assert.equal(await bcrypt.compare('password123', hash), true);
    assert.equal(await bcrypt.compare('wrong-password', hash), false);
  });
});