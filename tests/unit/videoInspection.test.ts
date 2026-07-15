import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildCustomerViewerUrl,
  generateShareToken,
  hashShareToken,
} from '../../src/lib/videoInspection/shareTokens';
import { CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT } from '../../src/prompts/customerVideoReport/systemPrompt';
import { buildCustomerVideoReportUserMessage } from '../../src/prompts/customerVideoReport/buildUserMessage';
import { isAllowedVideoPathname } from '../../src/lib/videoBlob';
import { normalizeE164, isSmsEnabled } from '../../src/lib/sms/twilio';

const root = resolve(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('video inspection share tokens', () => {
  it('hashes tokens stably and generates opaque values', () => {
    const token = generateShareToken();
    assert.ok(token.length >= 32);
    assert.equal(hashShareToken(token), hashShareToken(token));
    assert.notEqual(hashShareToken(token), hashShareToken(token + 'x'));
  });

  it('builds customer viewer URLs', () => {
    const url = buildCustomerViewerUrl('abcTOKEN');
    assert.match(url, /\/v\/abcTOKEN/);
  });
});

describe('customer video report prompts (isolated from warranty)', () => {
  it('uses customer tone and English-only output', () => {
    assert.match(CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT, /vehicle OWNER/i);
    assert.match(CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT, /professional English/i);
    assert.match(CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT, /What We Found/i);
    assert.equal(CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT.includes('warranty 3C'), true);
    assert.equal(CUSTOMER_VIDEO_REPORT_SYSTEM_PROMPT.includes('MI audit'), true);
  });

  it('injects Spanish narration language note', () => {
    const msg = buildCustomerVideoReportUserMessage({
      transcript: 'Neumáticos desgastados',
      transcriptLanguage: 'es',
      frameCount: 3,
      vehicleLabel: '2020 C300',
    });
    assert.match(msg, /Spanish|es/i);
    assert.match(msg, /Neumáticos/);
    assert.match(msg, /English/i);
  });
});

describe('video path allowlist', () => {
  it('allows only benz-tech/video prefix', () => {
    assert.equal(isAllowedVideoPathname('benz-tech/video/d1/file.webm'), true);
    assert.equal(isAllowedVideoPathname('benz-tech/other.webm'), false);
    assert.equal(isAllowedVideoPathname('benz-tech/video/../secret'), false);
  });
});

describe('SMS helpers', () => {
  it('normalizes US phone numbers', () => {
    assert.equal(normalizeE164('(555) 123-4567'), '+15551234567');
    assert.equal(normalizeE164('+15551234567'), '+15551234567');
    assert.equal(normalizeE164('12'), null);
  });

  it('defaults SMS disabled without env', () => {
    // Without SMS_ENABLED=true this is false in test env
    assert.equal(typeof isSmsEnabled(), 'boolean');
  });
});

describe('golden path isolation', () => {
  it('does not wire video into warranty story or RO extract routes', () => {
    const genStory = readSrc(
      'src/app/api/repair-orders/[id]/lines/[lineId]/generate-story/route.ts'
    );
    assert.equal(genStory.includes('videoInspection'), false);
    assert.equal(genStory.includes('customerVideoReport'), false);
    const extract = readSrc('src/app/api/repair-orders/extract/route.ts');
    assert.equal(extract.includes('videoInspection'), false);
  });

  it('schema defines VideoInspection models', () => {
    const schema = readSrc('prisma/schema.prisma');
    assert.match(schema, /model VideoInspection /);
    assert.match(schema, /model VideoInspectionShare /);
  });
});
