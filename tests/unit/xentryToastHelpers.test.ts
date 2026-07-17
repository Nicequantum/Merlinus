import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isXentryAnalysisFailure,
  xentryAnalysisFailureDetail,
} from '@/hooks/repairOrders/xentryToastHelpers';
import { ensureI18n } from '@/i18n/config';

describe('Xentry toast failure detection (H3)', () => {
  it('detects colon-style analysis failures', () => {
    assert.ok(isXentryAnalysisFailure('[Analysis failed: Grok timeout]'));
    assert.equal(xentryAnalysisFailureDetail('[Analysis failed: Grok timeout]'), 'Grok timeout');
  });

  it('detects per-image catch failures and returns localized analysisFailed', () => {
    assert.ok(isXentryAnalysisFailure('[Analysis failed for this image]'));
    assert.equal(
      xentryAnalysisFailureDetail('[Analysis failed for this image]'),
      ensureI18n().t('analysisFailed', { ns: 'xentry' })
    );
  });

  it('detects empty extraction failures and returns localized analysisFailed', () => {
    assert.ok(isXentryAnalysisFailure('[No diagnostic text extracted from image]'));
    assert.equal(
      xentryAnalysisFailureDetail('[No diagnostic text extracted from image]'),
      ensureI18n().t('analysisFailed', { ns: 'xentry' })
    );
  });

  it('does not flag successful extraction text', () => {
    assert.equal(isXentryAnalysisFailure('P0300 Cylinder 1 misfire'), false);
  });
});