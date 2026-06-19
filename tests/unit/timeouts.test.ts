import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CLIENT_BUFFER_MS,
  DIAGNOSTIC_EXTRACT_CLIENT_MS,
  DIAGNOSTIC_EXTRACT_GROK_MS,
  DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S,
  RO_EXTRACT_CLIENT_MS,
  RO_EXTRACT_GROK_MS,
  RO_EXTRACT_ROUTE_MAX_DURATION_S,
  ROUTE_BUFFER_S,
} from '../../src/lib/timeouts';

describe('vision extraction timeouts', () => {
  test('diagnostic hierarchy: client > route > grok', () => {
    assert.ok(DIAGNOSTIC_EXTRACT_CLIENT_MS > DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S * 1000);
    assert.ok(DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S * 1000 > DIAGNOSTIC_EXTRACT_GROK_MS);
    assert.equal(
      DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S,
      Math.ceil(DIAGNOSTIC_EXTRACT_GROK_MS / 1000) + ROUTE_BUFFER_S
    );
    assert.equal(
      DIAGNOSTIC_EXTRACT_CLIENT_MS,
      DIAGNOSTIC_EXTRACT_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS
    );
  });

  test('RO hierarchy: client > route > grok', () => {
    assert.ok(RO_EXTRACT_CLIENT_MS > RO_EXTRACT_ROUTE_MAX_DURATION_S * 1000);
    assert.ok(RO_EXTRACT_ROUTE_MAX_DURATION_S * 1000 > RO_EXTRACT_GROK_MS);
    assert.equal(
      RO_EXTRACT_ROUTE_MAX_DURATION_S,
      Math.ceil(RO_EXTRACT_GROK_MS / 1000) + ROUTE_BUFFER_S
    );
    assert.equal(RO_EXTRACT_CLIENT_MS, RO_EXTRACT_ROUTE_MAX_DURATION_S * 1000 + CLIENT_BUFFER_MS);
  });
});