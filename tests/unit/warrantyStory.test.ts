import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  STORY_TEMPLATES,
  SYSTEM_PROMPT,
  THREE_C_GENERATION_RULES,
  VETERAN_TECH_PERSONAS,
  WARRANTY_STORY_MAX_TOKENS,
  WARRANTY_WORKFLOW_STEPS,
  WARRANTY_WORKFLOW_SUMMARY,
  buildWarrantyStoryUserMessage,
  selectVeteranPersona,
} from '../../src/prompts/warrantyStory';
import type { RepairLine, RepairOrder } from '../../src/types';

const baseRo: RepairOrder = {
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
  repairLines: [],
};

const baseLine: RepairLine = {
  id: 'line-1',
  lineNumber: 1,
  description: 'Engine diagnosis',
  customerConcern: 'CHECK ENGINE LIGHT ON',
  technicianNotes: 'Found P0300. Source voltage 12.4V. Performed guided test on cylinder 3.',
  xentryImages: [],
  extractedData: {
    codes: ['P0300'],
    faultCodes: [{ code: 'P0300', description: 'Random/multiple cylinder misfire detected' }],
    guidedTests: ['Cylinder 3 misfire count elevated'],
    measurements: [{ label: 'Source voltage', value: '12.4V' }],
    components: [],
    circuits: [],
  },
};

describe('warranty story prompts', () => {
  test('SYSTEM_PROMPT enforces master-technician 3C quality at v3.0.0', () => {
    assert.match(SYSTEM_PROMPT, /Merlin/i);
    assert.match(SYSTEM_PROMPT, /v3\.0\.0/);
    assert.match(SYSTEM_PROMPT, /3C|Concern|Cause|Correction/i);
    assert.match(SYSTEM_PROMPT, /Quick Test/i);
    assert.match(SYSTEM_PROMPT, /Critical Quality Rules/i);
    assert.match(THREE_C_GENERATION_RULES, /Master Technician/i);
    assert.match(THREE_C_GENERATION_RULES, /\[NOT DOCUMENTED\]/);
    assert.match(THREE_C_GENERATION_RULES, /Never invent codes/i);
    assert.ok(SYSTEM_PROMPT.length > 1_200);
  });

  test('VETERAN_TECH_PERSONAS provides six distinct master-technician voices', () => {
    assert.equal(VETERAN_TECH_PERSONAS.length, 6);
    const voices = new Set(VETERAN_TECH_PERSONAS.map((p) => p.voice));
    assert.equal(voices.size, 6);
    for (const persona of VETERAN_TECH_PERSONAS) {
      assert.ok(persona.years >= 15 && persona.years <= 30);
    }
  });

  test('selectVeteranPersona rotates by line number', () => {
    assert.equal(selectVeteranPersona(1).id, VETERAN_TECH_PERSONAS[0]!.id);
    assert.equal(selectVeteranPersona(7).id, VETERAN_TECH_PERSONAS[0]!.id);
    assert.notEqual(selectVeteranPersona(1).id, selectVeteranPersona(2).id);
  });

  test('WARRANTY_WORKFLOW_STEPS lists all 10 billing/audit steps in order', () => {
    assert.equal(WARRANTY_WORKFLOW_STEPS.length, 10);
    assert.match(WARRANTY_WORKFLOW_STEPS[0], /Initial test drive/i);
    assert.match(WARRANTY_WORKFLOW_STEPS[9], /Final verification test drive/i);
    assert.match(WARRANTY_WORKFLOW_SUMMARY, /verification drive/i);
  });

  test('STORY_TEMPLATES reference diagnostic workflow elements', () => {
    assert.ok(STORY_TEMPLATES.length >= 5);
    for (const template of STORY_TEMPLATES) {
      assert.match(template, /workflow|drive|Quick Test|voltage|XENTRY|guided test|verification|complaint/i);
    }
  });

  test('buildWarrantyStoryUserMessage includes persona, line data, and full workflow instruction', () => {
    const message = buildWarrantyStoryUserMessage(baseRo, baseLine);
    assert.match(message, /Line 1/i);
    assert.match(message, /28450→28458/);
    assert.match(message, /P0300/);
    assert.match(message, /STYLE VARIATION/i);
    assert.match(message, /persona/i);
    assert.match(message, /10-step/i);
    assert.match(message, /never copy verbatim/i);
    assert.match(message, /<<<TECHNICIAN_NOTES>>/);
  });

  test('WARRANTY_STORY_MAX_TOKENS allows full workflow narratives', () => {
    assert.ok(WARRANTY_STORY_MAX_TOKENS >= 4096);
  });
});