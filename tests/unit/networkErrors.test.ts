import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isNetworkFailure,
  networkRetryDelayMs,
  NETWORK_RETRY_BASE_MS,
  NETWORK_RETRY_MAX_ATTEMPTS,
} from '../../src/lib/networkErrors';

describe('networkErrors', () => {
  test('isNetworkFailure detects fetch transport errors', () => {
    assert.equal(isNetworkFailure(new TypeError('Failed to fetch')), true);
    assert.equal(isNetworkFailure(new Error('NetworkError when attempting to fetch resource.')), true);
  });

  test('isNetworkFailure ignores abort and API errors', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    assert.equal(isNetworkFailure(abort), false);
    assert.equal(isNetworkFailure(new Error('Request failed. Please try again.')), false);
  });

  test('retry backoff grows exponentially', () => {
    assert.equal(networkRetryDelayMs(0), NETWORK_RETRY_BASE_MS);
    assert.equal(networkRetryDelayMs(1), NETWORK_RETRY_BASE_MS * 2);
    assert.equal(NETWORK_RETRY_MAX_ATTEMPTS, 3);
  });
});