import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  appendUniqueDetailText,
  applyAllTechnicianDetails,
  applyTechnicianDetail,
  formatTechnicianDetailInsert,
  technicianDetailActionLabel,
} from '../../src/lib/applyTechnicianDetails';
import {
  GENERATE_STORY_BUTTON_LABEL,
  MI_PRODUCT_LABEL,
  STORY_MODEL_DISPLAY_VERSION,
  parseGrokModelVersion,
} from '../../src/lib/grokModels';
import type { TechnicianDetailPrompt } from '../../src/types';

describe('applyTechnicianDetails', () => {
  test('appends diagnostic and workflow into technician notes with tags', () => {
    const line = { technicianNotes: 'Found P0300.', customerConcern: 'CEL on' };
    const diagnostic: TechnicianDetailPrompt = {
      missing: 'Guided test result',
      prompt: 'Record guided test result for cylinder 3.',
      field: 'diagnostic',
    };
    const patch = applyTechnicianDetail(line, diagnostic);
    assert.match(patch.technicianNotes || '', /\[Diagnostic\]/);
    assert.match(patch.technicianNotes || '', /cylinder 3/i);
    assert.equal(patch.customerConcern, undefined);
  });

  test('appends customerConcern field into concern text', () => {
    const line = { technicianNotes: 'Notes', customerConcern: 'Noise' };
    const detail: TechnicianDetailPrompt = {
      missing: 'When noise occurs',
      prompt: 'Document when noise occurs (cold/hot).',
      field: 'customerConcern',
    };
    const patch = applyTechnicianDetail(line, detail);
    assert.match(patch.customerConcern || '', /when noise occurs/i);
    assert.equal(patch.technicianNotes, undefined);
  });

  test('apply all merges every detail without duplicating', () => {
    const line = { technicianNotes: '', customerConcern: '' };
    const details: TechnicianDetailPrompt[] = [
      { missing: 'A', prompt: 'Add voltage reading.', field: 'technicianNotes' },
      { missing: 'B', prompt: 'Add final road test miles.', field: 'workflow' },
    ];
    const once = applyAllTechnicianDetails(line, details);
    const twice = applyAllTechnicianDetails(
      { technicianNotes: once.technicianNotes || '', customerConcern: once.customerConcern || '' },
      details
    );
    assert.match(once.technicianNotes || '', /voltage reading/);
    assert.match(once.technicianNotes || '', /\[Workflow\]/);
    assert.equal(twice.technicianNotes, undefined);
  });

  test('appendUniqueDetailText is idempotent', () => {
    assert.equal(appendUniqueDetailText('hello', 'hello'), 'hello');
    assert.equal(appendUniqueDetailText('hello', 'world'), 'hello\n\nworld');
  });

  test('format and action labels', () => {
    assert.match(formatTechnicianDetailInsert({ missing: 'X', prompt: 'Y', field: 'workflow' }), /Y/);
    assert.equal(technicianDetailActionLabel('diagnostic'), 'Add to Diagnostic Evidence');
    assert.equal(technicianDetailActionLabel('workflow'), 'Add to Workflow Steps');
  });
});

describe('story model display labels', () => {
  test('parses grok model ids to short versions', () => {
    assert.equal(parseGrokModelVersion('grok-4.20-0309-non-reasoning'), '4.20');
    assert.equal(parseGrokModelVersion('grok-4.3'), '4.3');
    assert.equal(parseGrokModelVersion('grok-4.5'), '4.5');
  });

  test('UI product label reflects current story model (not legacy 4.3)', () => {
    assert.equal(STORY_MODEL_DISPLAY_VERSION, '4.20');
    assert.equal(MI_PRODUCT_LABEL, 'MI 4.20');
    assert.equal(GENERATE_STORY_BUTTON_LABEL, 'Generate MI 4.20');
    assert.doesNotMatch(GENERATE_STORY_BUTTON_LABEL, /4\.3/);
  });
});
