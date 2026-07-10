import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildDealerProvisionAuditMetadata,
  DEALER_PROVISION_METADATA_ALLOWED_KEYS,
  hashDealerCodeForAudit,
  normalizeDealerCode,
  ProvisionDealerError,
  validateDealerName,
  validateRooftopDisplayName,
  PROVISION_DENY_DEALERSHIP_IDS,
} from '@/lib/apex/provisionDealer';
import { getDealerTemplate, isDealerTemplateId, listDealerTemplates } from '@/lib/apex/dealerTemplates';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';

const root = resolve(process.cwd());

describe('dealerTemplates', () => {
  it('exposes mercedes and generic rooftop templates', () => {
    const list = listDealerTemplates();
    assert.ok(list.length >= 2);
    assert.ok(isDealerTemplateId('mercedes-rooftop-v1'));
    assert.ok(isDealerTemplateId('generic-rooftop-v1'));
    const m = getDealerTemplate('mercedes-rooftop-v1');
    assert.equal(m?.loginStrategy, 'd7');
    assert.equal(m?.features.xentry, true);
    const g = getDealerTemplate('generic-rooftop-v1');
    assert.equal(g?.loginStrategy, 'apex_username');
    assert.equal(g?.features.xentry, false);
  });
});

describe('provisionDealer naming + security helpers', () => {
  it('normalizes dealer codes', () => {
    assert.equal(normalizeDealerCode(' newport '), 'NEWPORT');
    assert.equal(normalizeDealerCode('new-port_1'), 'NEW-PORT_1');
  });

  it('accepts full storefront rooftop names', () => {
    assert.equal(
      validateRooftopDisplayName('  Mercedes-Benz of Newport  '),
      'Mercedes-Benz of Newport'
    );
  });

  it('rejects Merlinus / placeholder rooftop names', () => {
    assert.throws(() => validateRooftopDisplayName('Merlinus'), ProvisionDealerError);
    assert.throws(() => validateRooftopDisplayName('seed-dealership'), ProvisionDealerError);
    assert.throws(() => validateRooftopDisplayName('TODO'), ProvisionDealerError);
    assert.throws(() => validateRooftopDisplayName('Mercedes-Benz of Tiverton'), ProvisionDealerError);
  });

  it('validates franchise dealer name length', () => {
    assert.equal(validateDealerName('Coastal MB Group'), 'Coastal MB Group');
    assert.throws(() => validateDealerName('ab'), ProvisionDealerError);
  });

  it('denies pilot and sentinel dealership ids', () => {
    assert.ok(PROVISION_DENY_DEALERSHIP_IDS.has('seed-dealership'));
    assert.ok(PROVISION_DENY_DEALERSHIP_IDS.has(APEX_NATIONAL_DEALERSHIP_ID));
  });

  it('builds PII-free dealer.provision audit metadata', () => {
    const template = getDealerTemplate('mercedes-rooftop-v1')!;
    const meta = buildDealerProvisionAuditMetadata({
      template,
      dealerCode: 'NEWPORT',
      dealerId: 'dealer-id-1',
      dealershipId: 'rooftop-id-1',
      managerTechnicianId: 'mgr-id-1',
      actor: { type: 'script', id: 'ci-runner' },
      ifExistsMode: 'fail',
      outcome: 'created',
    });
    for (const key of Object.keys(meta)) {
      assert.ok(DEALER_PROVISION_METADATA_ALLOWED_KEYS.has(key), `unexpected key ${key}`);
    }
    assert.equal('email' in meta, false);
    assert.equal('name' in meta, false);
    assert.equal('d7Number' in meta, false);
    assert.equal('password' in meta, false);
    assert.equal('rooftopName' in meta, false);
    assert.equal('dealerName' in meta, false);
    assert.equal(typeof meta.dealerCodeHash, 'string');
    assert.equal((meta.dealerCodeHash as string).length, 64);
    assert.notEqual(meta.dealerCodeHash, 'NEWPORT');
  });

  it('hashes dealer codes stably', () => {
    assert.equal(hashDealerCodeForAudit('newport'), hashDealerCodeForAudit('NEWPORT'));
  });

  it('CLI rejects password argv flags', () => {
    const src = readFileSync(resolve(root, 'scripts/provision-dealer.ts'), 'utf8');
    assert.match(src, /FORBIDDEN_PASSWORD_FLAGS/);
    assert.match(src, /manager-password-env/);
    assert.match(src, /password-stdin/);
    assert.match(src, /show-credentials/);
    assert.match(src, /APEX_PROVISION_ALLOW_YES/);
    assert.doesNotMatch(src, /flags\['manager-password'\]\s*=/);
  });

  it('registers dealer.provision as critical audit action', () => {
    const audit = readFileSync(resolve(root, 'src/lib/audit.ts'), 'utf8');
    assert.match(audit, /dealer\.provision/);
    assert.match(audit, /CRITICAL_AUDIT_ACTIONS/);
  });
});
