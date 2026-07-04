import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapBlobRouteError,
  mapGrokRouteError,
  mapScanRouteError,
  parseGrokApiErrorBody,
  ScanRouteError,
} from '@/lib/scanRouteErrors';
import { handleRouteError } from '@/lib/errors';

describe('scan route errors', () => {
  it('surfaces blob token misconfiguration', () => {
    const mapped = mapBlobRouteError(new Error('BLOB_READ_WRITE_TOKEN is not configured'), 'upload');
    assert.equal(mapped.status, 503);
    assert.match(mapped.message, /BLOB_READ_WRITE_TOKEN/);
  });

  it('includes Grok API status and detail in the message', () => {
    const mapped = mapGrokRouteError(
      new Error('Grok API error: 401 — Invalid API key provided'),
      'Repair order scan'
    );
    assert.equal(mapped.status, 503);
    assert.match(mapped.message, /401/);
    assert.match(mapped.message, /Invalid API key/);
  });

  it('parses xAI JSON error bodies', () => {
    const detail = parseGrokApiErrorBody(
      JSON.stringify({ error: { message: 'Incorrect API key', code: 'invalid_api_key' } })
    );
    assert.match(detail, /Incorrect API key/);
    assert.match(detail, /invalid_api_key/);
  });

  it('handleRouteError returns real message for upload route context', async () => {
    const response = handleRouteError(
      new Error('BLOB_READ_WRITE_TOKEN is not configured'),
      'upload'
    );
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /BLOB_READ_WRITE_TOKEN/);
    assert.doesNotMatch(body.error, /Something went wrong/);
  });

  it('handleRouteError returns ScanRouteError message for extract context', async () => {
    const response = handleRouteError(
      new ScanRouteError('Repair order scan failed (HTTP 502). — model not found', 502),
      'ro.extract'
    );
    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /model not found/);
  });

  it('mapScanRouteError classifies Grok failures in diagnostics context', () => {
    const mapped = mapScanRouteError(new Error('Grok API error: 429 — rate limit'), 'diagnostics.extract');
    assert.equal(mapped.status, 429);
    assert.match(mapped.message, /Diagnostic scan|AI service is busy/i);
  });
});