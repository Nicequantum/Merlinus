import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());

describe('PR-G3 group owner dashboard', () => {
  it('summary module exposes Tier 1 fields and rooftop scorecards', () => {
    const src = readFileSync(resolve(root, 'src/lib/apex/ownerNationalSummary.ts'), 'utf8');
    assert.match(src, /repairOrders7d/);
    assert.match(src, /repairOrders30d/);
    assert.match(src, /certifiedStories7d/);
    assert.match(src, /certifiedStories30d/);
    assert.match(src, /adoptionRatePct/);
    assert.match(src, /attentionFlagCount/);
    assert.match(src, /OwnerRooftopScorecard/);
    assert.match(src, /technicianCertifiedStory/);
    assert.match(src, /rooftops/);
  });

  it('owner shell renders Tier 1 labels and rooftop comparison', () => {
    const src = readFileSync(
      resolve(root, 'src/components/apex/ApexOwnerNationalShell.tsx'),
      'utf8'
    );
    assert.match(src, /Rooftops active/);
    assert.match(src, /Brands \/ dealers/);
    assert.match(src, /Active staff/);
    assert.match(src, /RO volume/);
    assert.match(src, /Stories certified/);
    assert.match(src, /Adoption rate/);
    assert.match(src, /Attention flags/);
    assert.match(src, /Rooftop comparison/);
    assert.match(src, /RooftopCard/);
    assert.match(src, /apex-rooftop-grid/);
  });

  it('CSS includes rooftop scoreboard styles', () => {
    const css = readFileSync(resolve(root, 'src/styles/apex-platform.css'), 'utf8');
    assert.match(css, /\.apex-rooftop-grid/);
    assert.match(css, /\.apex-rooftop-card/);
    assert.match(css, /\.apex-rooftop-status--healthy/);
    assert.match(css, /\.apex-attention-list/);
  });
});
