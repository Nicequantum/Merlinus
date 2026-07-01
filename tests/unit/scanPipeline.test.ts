import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '@/lib/api';
import { GENERIC_ERROR } from '@/lib/errors';
import { formatScanApiError, isRetriableScanMessage, isStrongGrokExtraction } from '@/lib/scanPipeline';

describe('scan pipeline errors', () => {
  it('surfaces ApiError messages to technicians', () => {
    const message = formatScanApiError(
      new ApiError('Repair order scan timed out — try again in a moment.', 504)
    );
    assert.equal(message, 'Repair order scan timed out — try again in a moment.');
  });

  it('includes HTTP status when server returns generic error text', () => {
    const message = formatScanApiError(new ApiError(GENERIC_ERROR, 500));
    assert.match(message, /HTTP 500/);
    assert.match(message, /Something went wrong/);
  });

  it('prefers server message over fallback', () => {
    const message = formatScanApiError(
      new ApiError('Photo upload failed: storage quota exceeded', 502),
      'ignored fallback'
    );
    assert.equal(message, 'Photo upload failed: storage quota exceeded');
  });

  it('detects retriable scan messages', () => {
    assert.equal(isRetriableScanMessage('AI service is busy. Wait a moment and try again.'), true);
    assert.equal(isRetriableScanMessage('This photo is not available for processing.'), false);
  });

  it('treats Grok output with complaints as strong enough to skip OCR wait', () => {
    assert.equal(
      isStrongGrokExtraction({
        vehicle: { vin: '', year: '', make: '', model: '', engine: '', mileageIn: '', mileageOut: '' },
        complaints: ['Check engine light on'],
        customerName: 'Jane',
        roNumber: '12345',
      }),
      true
    );
  });

  it('requires OCR fallback when Grok returns no complaints and incomplete header', () => {
    assert.equal(isStrongGrokExtraction(null), false);
    assert.equal(
      isStrongGrokExtraction({
        vehicle: { vin: '', year: '', make: '', model: '', engine: '', mileageIn: '', mileageOut: '' },
        complaints: [],
        customerName: '',
        roNumber: '',
      }),
      false
    );
  });
});