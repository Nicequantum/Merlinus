import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { dbToRepairLine, dbToRepairOrder, repairLineToDbFields, repairOrderToDbFields } from '../../src/lib/roMapper';
import type { RepairLine, RepairOrder, StoryQualityResult } from '../../src/types';

const sampleRo: RepairOrder = {
  id: 'ro-1',
  roNumber: '482910',
  vehicle: {
    vin: 'W1N4N4HB5NJ123456',
    year: '2022',
    make: 'Mercedes-Benz',
    model: 'GLE 350',
    mileageIn: '28450',
    mileageOut: '28458',
  },
  customer: { name: 'John Smith' },
  complaints: ['# A CHECK ENGINE LIGHT ON'],
  xentryOcrTexts: ['RO-level Quick Test OCR block'],
  repairLines: [],
};

const sampleLine: RepairLine = {
  id: 'line-1',
  lineNumber: 1,
  description: 'Engine diagnosis',
  customerConcern: 'CHECK ENGINE LIGHT ON',
  technicianNotes: 'Found P0300. Source voltage 12.4V.',
  xentryImages: [],
  xentryOcrTexts: ['P0300 Random Misfire', 'Cylinder 3 misfire count elevated'],
  extractedData: {
    codes: ['P0300'],
    faultCodes: [{ code: 'P0300', description: 'Random/multiple cylinder misfire detected' }],
    guidedTests: [],
    measurements: [],
    components: [],
    circuits: [],
  },
  warrantyStory: 'Customer presented with check engine light. Verified P0300 and replaced coil.',
};

describe('roMapper sensitive field encryption', () => {
  before(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-with-32-chars-minimum';
  });

  test('repairOrderToDbFields encrypts RO-level OCR text arrays', () => {
    const fields = repairOrderToDbFields({
      roNumber: sampleRo.roNumber,
      vehicle: sampleRo.vehicle,
      customer: sampleRo.customer,
      complaints: sampleRo.complaints,
      xentryOcrTexts: sampleRo.xentryOcrTexts,
      repairLines: [],
    });

    assert.notEqual(fields.xentryOcrTextsEncrypted, JSON.stringify(sampleRo.xentryOcrTexts));
    assert.ok(fields.xentryOcrTextsEncrypted.length > 0);
    assert.equal('roNumber' in fields, false);
    assert.ok(Array.isArray(fields.roNumberSearchTokens));
    assert.ok(fields.roNumberSearchTokens.length > 0);
  });

  test('repairLineToDbFields encrypts technician notes, OCR texts, and warranty stories', () => {
    const fields = repairLineToDbFields(sampleLine);

    assert.notEqual(fields.technicianNotesEncrypted, sampleLine.technicianNotes);
    assert.notEqual(fields.xentryOcrTextsEncrypted, JSON.stringify(sampleLine.xentryOcrTexts));
    assert.notEqual(fields.warrantyStoryEncrypted, sampleLine.warrantyStory);
    assert.notEqual(fields.extractedDataEncrypted, JSON.stringify(sampleLine.extractedData));
    assert.ok(fields.technicianNotesEncrypted.length > 0);
    assert.ok(fields.xentryOcrTextsEncrypted.length > 0);
    assert.ok(fields.warrantyStoryEncrypted && fields.warrantyStoryEncrypted.length > 0);
    assert.ok(fields.extractedDataEncrypted.length > 0);
    assert.equal('storyQualityAuditEncrypted' in fields, false);
    assert.equal('description' in fields, false);
  });

  test('repairLineToDbFields encrypts persisted story quality audits when provided', () => {
    const audit: StoryQualityResult = {
      score: 82,
      grade: 'strong',
      strengths: ['Clear workflow'],
      improvements: [],
      auditRisks: [],
      technicianDetails: [],
      summary: 'Solid narrative',
      scoredAgainstStory: sampleLine.warrantyStory,
    };
    const fields = repairLineToDbFields({ ...sampleLine, storyQualityAudit: audit });
    assert.ok(fields.storyQualityAuditEncrypted && fields.storyQualityAuditEncrypted.length > 0);
    assert.notEqual(fields.storyQualityAuditEncrypted, JSON.stringify(audit));
  });

  test('db mappers decrypt sensitive fields back to plaintext for API/UI', () => {
    const roFields = repairOrderToDbFields({
      roNumber: sampleRo.roNumber,
      vehicle: sampleRo.vehicle,
      customer: sampleRo.customer,
      complaints: sampleRo.complaints,
      xentryOcrTexts: sampleRo.xentryOcrTexts,
      repairLines: [],
    });
    const lineFields = repairLineToDbFields(sampleLine);

    const mappedRo = dbToRepairOrder({
      id: 'ro-1',
      roNumberEncrypted: roFields.roNumberEncrypted,
      roNumberSearchTokens: roFields.roNumberSearchTokens,
      technicianId: 'tech-1',
      dealershipId: 'dealer-1',
      serviceAdvisorId: null,
      serviceAdvisorNameEncrypted: '',
      advisorMatchConfidence: null,
      advisorIdentifiedAt: null,
      vinEncrypted: roFields.vinEncrypted,
      year: roFields.year,
      make: roFields.make,
      model: roFields.model,
      engine: roFields.engine,
      mileageIn: roFields.mileageIn,
      mileageOut: roFields.mileageOut,
      customerNameEncrypted: roFields.customerNameEncrypted,
      complaintsEncrypted: roFields.complaintsEncrypted,
      xentryImageUrls: roFields.xentryImageUrls,
      xentryOcrTextsEncrypted: roFields.xentryOcrTextsEncrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
      repairLines: [
        {
          id: sampleLine.id,
          repairOrderId: 'ro-1',
          lineNumber: sampleLine.lineNumber,
          descriptionEncrypted: lineFields.descriptionEncrypted,
          customerConcernEncrypted: lineFields.customerConcernEncrypted,
          technicianNotesEncrypted: lineFields.technicianNotesEncrypted,
          xentryImageUrls: lineFields.xentryImageUrls,
          xentryOcrTextsEncrypted: lineFields.xentryOcrTextsEncrypted,
          extractedDataEncrypted: lineFields.extractedDataEncrypted,
          warrantyStoryEncrypted: lineFields.warrantyStoryEncrypted,
          storyQualityAuditEncrypted: '',
          isCustomerPay: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      serviceAdvisor: null,
    });

    const mappedLine = mappedRo.repairLines[0];
    assert.deepEqual(mappedRo.xentryOcrTexts, sampleRo.xentryOcrTexts);
    assert.equal(mappedLine.technicianNotes, sampleLine.technicianNotes);
    assert.deepEqual(mappedLine.xentryOcrTexts, sampleLine.xentryOcrTexts);
    assert.equal(mappedLine.warrantyStory, sampleLine.warrantyStory);
    assert.deepEqual(mappedLine.extractedData?.codes, sampleLine.extractedData?.codes);
    assert.equal(mappedLine.storyQualityAudit, null);
  });

  test('dbToRepairOrder reads roNumber from encrypted column', () => {
    const roFields = repairOrderToDbFields({
      roNumber: sampleRo.roNumber,
      vehicle: sampleRo.vehicle,
      customer: sampleRo.customer,
      complaints: sampleRo.complaints,
      repairLines: [],
    });

    const mapped = dbToRepairOrder({
      id: 'ro-encrypted-only',
      roNumberEncrypted: roFields.roNumberEncrypted,
      roNumberSearchTokens: roFields.roNumberSearchTokens,
      technicianId: 'tech-1',
      dealershipId: 'dealer-1',
      serviceAdvisorId: null,
      serviceAdvisorNameEncrypted: '',
      advisorMatchConfidence: null,
      advisorIdentifiedAt: null,
      vinEncrypted: roFields.vinEncrypted,
      year: roFields.year,
      make: roFields.make,
      model: roFields.model,
      engine: roFields.engine,
      mileageIn: roFields.mileageIn,
      mileageOut: roFields.mileageOut,
      customerNameEncrypted: roFields.customerNameEncrypted,
      complaintsEncrypted: roFields.complaintsEncrypted,
      xentryImageUrls: roFields.xentryImageUrls,
      xentryOcrTextsEncrypted: roFields.xentryOcrTextsEncrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
      repairLines: [],
      serviceAdvisor: null,
    });

    assert.equal(mapped.roNumber, sampleRo.roNumber);
  });

  test('dbToRepairLine decrypts persisted story quality audits', () => {
    const audit: StoryQualityResult = {
      score: 91,
      grade: 'excellent',
      strengths: [],
      improvements: [],
      auditRisks: [],
      technicianDetails: [],
      summary: 'Ready',
      scoredAgainstStory: sampleLine.warrantyStory,
    };
    const lineFields = repairLineToDbFields({ ...sampleLine, storyQualityAudit: audit });
    const mapped = dbToRepairLine({
      id: sampleLine.id,
      repairOrderId: 'ro-1',
      lineNumber: sampleLine.lineNumber,
      descriptionEncrypted: lineFields.descriptionEncrypted,
      customerConcernEncrypted: lineFields.customerConcernEncrypted,
      technicianNotesEncrypted: lineFields.technicianNotesEncrypted,
      xentryImageUrls: lineFields.xentryImageUrls,
      xentryOcrTextsEncrypted: lineFields.xentryOcrTextsEncrypted,
      extractedDataEncrypted: lineFields.extractedDataEncrypted,
      warrantyStoryEncrypted: lineFields.warrantyStoryEncrypted,
      storyQualityAuditEncrypted: lineFields.storyQualityAuditEncrypted ?? '',
      isCustomerPay: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(mapped.storyQualityAudit?.score, 91);
    assert.equal(mapped.storyQualityAudit?.scoredAgainstStory, sampleLine.warrantyStory);
  });
});