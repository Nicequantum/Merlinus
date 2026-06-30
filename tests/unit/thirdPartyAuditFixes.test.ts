import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CRITICAL_AUDIT_ACTIONS } from '@/lib/audit';
import { hashWarrantyStory } from '@/lib/storyHash';
import { storyCertificationMatchesStory } from '@/lib/storyCertification';
import { STORY_REVIEW_CLIENT_MS, UPLOAD_CLIENT_MS } from '@/lib/timeouts';

const root = resolve(process.cwd());

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Third-party audit hardening', () => {
  it('legal disclaimer is server-gated with version re-check and audit trail', () => {
    const apiRoute = readSrc('src/lib/apiRoute.ts');
    const disclaimerRoute = readSrc('src/app/api/legal-disclaimer/route.ts');
    assert.ok(apiRoute.includes('LEGAL_DISCLAIMER_REQUIRED_ERROR'));
    assert.ok(apiRoute.includes('legalDisclaimerVersion'));
    assert.ok(apiRoute.includes('skipLegalDisclaimer'));
    assert.ok(disclaimerRoute.includes("action: 'legalDisclaimer.accept'"));
    assert.ok(disclaimerRoute.includes('skipLegalDisclaimer: true'));
    assert.ok(CRITICAL_AUDIT_ACTIONS.has('legalDisclaimer.accept'));
  });

  it('story certification persists on RepairLine with hash binding', () => {
    const schema = readSrc('prisma/schema.prisma');
    const certifyRoute = readSrc(
      'src/app/api/repair-orders/[id]/lines/[lineId]/certify-story/route.ts'
    );
    assert.ok(schema.includes('storyCertifiedHash'));
    assert.ok(certifyRoute.includes('buildStoryCertificationDbFields'));
    assert.ok(certifyRoute.includes('storyHash'));
    assert.ok(certifyRoute.includes('namesMatchForCertification'));
  });

  it('story hash is stable for identical sanitized text', () => {
    const story = 'Customer states check engine light is on.';
    const hashA = hashWarrantyStory(story);
    const hashB = hashWarrantyStory(story);
    assert.equal(hashA, hashB);
    assert.ok(
      storyCertificationMatchesStory(
        { certifiedByName: 'Tech', certifiedAt: new Date().toISOString(), storyHash: hashA, certifiedByTechnicianId: 't1' },
        story
      )
    );
  });

  it('production rate limiting fails closed without KV', () => {
    const src = readSrc('src/lib/rate-limit.ts');
    assert.ok(src.includes('request blocked'));
    assert.ok(src.includes('503'));
  });

  it('technician UI paths do not use console.log for debug noise', () => {
    const technicianPaths = [
      'src/components/LineView.tsx',
      'src/components/BenzTechApp.tsx',
      'src/components/BenzTechAuthenticatedApp.tsx',
      'src/hooks/repairOrders/useROStoryWorkflow.ts',
      'src/hooks/repairOrders/useROScan.ts',
      'src/hooks/useRepairOrders.ts',
      'src/services/ocr.ts',
    ];
    for (const relativePath of technicianPaths) {
      const src = readSrc(relativePath);
      assert.equal(src.includes('console.log'), false, `${relativePath} must not contain console.log`);
    }
  });

  it('ErrorBoundary does not expose raw error messages to users', () => {
    const src = readSrc('src/components/ErrorBoundary.tsx');
    assert.equal(src.includes('error.message'), false);
    assert.equal(src.includes('this.state.message'), false);
    assert.ok(src.includes('Sentry.captureException'));
    assert.ok(src.includes('supportReference'));
    assert.ok(src.includes('contact your manager or IT support'));
  });

  it('Grok errors do not echo response bodies', () => {
    const src = readSrc('src/lib/grok.ts');
    assert.ok(src.includes('grok.api_error'));
    assert.equal(src.includes('${err}'), false);
    assert.equal(src.includes('errBody'), true);
  });

  it('service advisors are blocked from Grok extraction routes', () => {
    assert.ok(readSrc('src/app/api/diagnostics/extract/route.ts').includes('blockServiceAdvisorAi'));
    assert.ok(readSrc('src/app/api/repair-orders/extract/route.ts').includes('blockServiceAdvisorAi'));
  });

  it('compliance routes use atomic Prisma transactions for DB + audit', () => {
    const consent = readSrc('src/app/api/consent/route.ts');
    const disclaimer = readSrc('src/app/api/legal-disclaimer/route.ts');
    const certify = readSrc('src/app/api/repair-orders/[id]/lines/[lineId]/certify-story/route.ts');
    assert.ok(consent.includes('prisma.$transaction'));
    assert.ok(consent.includes('appendAuditLogInTransaction'));
    assert.ok(disclaimer.includes('prisma.$transaction'));
    assert.ok(disclaimer.includes('appendAuditLogInTransaction'));
    assert.ok(certify.includes('prisma.$transaction'));
    assert.ok(certify.includes('appendAuditLogInTransaction'));
  });

  it('service advisors are blocked from customer-pay template routes', () => {
    assert.ok(
      readSrc('src/app/api/repair-orders/[id]/lines/[lineId]/apply-customer-pay-template/route.ts').includes(
        'blockServiceAdvisorAi'
      )
    );
    assert.ok(
      readSrc('src/app/api/repair-orders/[id]/lines/[lineId]/clear-customer-pay/route.ts').includes(
        'blockServiceAdvisorAi'
      )
    );
  });

  it('client timeouts align with shared constants', () => {
    const apiSrc = readSrc('src/lib/api.ts');
    assert.ok(apiSrc.includes('STORY_REVIEW_CLIENT_MS'));
    assert.ok(apiSrc.includes('UPLOAD_CLIENT_MS'));
    assert.equal(apiSrc.includes('120_000'), false);
    assert.equal(STORY_REVIEW_CLIENT_MS, 130_000);
    assert.equal(UPLOAD_CLIENT_MS, 60_000);
  });

  it('HSTS is production-only', () => {
    const src = readSrc('next.config.mjs');
    assert.ok(src.includes("process.env.NODE_ENV === 'production'"));
    assert.ok(src.includes('Strict-Transport-Security'));
  });

  it('image access verifies exact pathname matches', () => {
    const src = readSrc('src/lib/imageAccess.ts');
    assert.ok(src.includes('imageJsonContainsPathname'));
    assert.ok(src.includes('auditMetadataContainsPathname'));
  });

  it('encryption and PII modules are server-only', () => {
    const encryption = readSrc('src/lib/encryption.ts');
    const roMapper = readSrc('src/lib/roMapper.ts');
    const piiRead = readSrc('src/lib/piiFieldRead.ts');
    const piiSearch = readSrc('src/lib/piiSearchToken.ts');
    const auth = readSrc('src/lib/auth.ts');
    assert.ok(encryption.includes("import 'server-only'"));
    assert.ok(roMapper.includes("import 'server-only'"));
    assert.ok(piiRead.includes("import 'server-only'"));
    assert.ok(piiSearch.includes("import 'server-only'"));
    assert.ok(auth.includes("import 'server-only'"));
  });

  it('client hooks do not import server-only certification modules', () => {
    const useRepairOrders = readSrc('src/hooks/useRepairOrders.ts');
    assert.ok(useRepairOrders.includes('storyCertificationClient'));
    assert.equal(useRepairOrders.includes("from '@/lib/storyCertification'"), false);
    assert.ok(readSrc('src/lib/storyCertification.ts').includes("import 'server-only'"));
  });

  it('login shell does not import useRepairOrders or OCR modules', () => {
    const shell = readSrc('src/components/BenzTechApp.tsx');
    assert.equal(shell.includes('useRepairOrders'), false);
    assert.equal(shell.includes('useOcrProgress'), false);
    assert.equal(shell.includes('useSession'), false);
    assert.equal(shell.includes("from '@/lib/api'"), false);
    assert.equal(shell.includes("from '@/hooks/useSession'"), false);
    assert.ok(shell.includes('BenzTechAuthenticatedApp'));
    assert.ok(shell.includes('loginSession'));
    assert.ok(readSrc('src/components/BenzTechAuthenticatedApp.tsx').includes('useRepairOrders'));
  });

  it('PII Phase 5 uses encrypted-only storage in Merlinus v2', () => {
    const schema = readSrc('prisma/schema.prisma');
    const roMapper = readSrc('src/lib/roMapper.ts');
    const resolveAdvisor = readSrc('src/lib/advisorIntelligence/resolveAdvisor.ts');
    assert.equal(schema.includes('roNumber                   String'), false);
    assert.equal(schema.includes('description               String'), false);
    assert.ok(schema.includes('roNumberEncrypted'));
    assert.ok(schema.includes('descriptionEncrypted'));
    assert.ok(roMapper.includes('roNumberEncrypted: encryptPII'));
    assert.ok(roMapper.includes('roNumberSearchTokens: buildRoNumberSearchTokens'));
    assert.equal(roMapper.includes("roNumber: ''"), false);
    assert.ok(resolveAdvisor.includes('displayNameEncrypted: encryptPII'));
    assert.ok(readSrc('src/lib/roListQuery.ts').includes('roNumberSearchTokens'));
    assert.ok(readSrc('src/lib/piiFieldRead.ts').includes('readRoNumberFromDb'));
    assert.ok(readSrc('prisma/migrations/20250630140000_drop_pii_plaintext_columns/migration.sql').includes('DROP COLUMN'));
  });

  it('login shell paints before session gate and keeps post-auth chunks off critical path', () => {
    const shell = readSrc('src/components/BenzTechApp.tsx');
    assert.ok(shell.includes('LoginView'));
    assert.ok(shell.includes("from '@/components/LoginView'"));
    assert.ok(shell.includes("from '@/components/ConsentModal'"));
    assert.ok(shell.includes("from '@/components/LegalDisclaimerModal'"));
    assert.equal(shell.includes('sessionLoading'), false);
    assert.ok(shell.includes('sessionPhase'));
    assert.ok(shell.includes('loading: () =>'));
    assert.ok(readSrc('src/components/HomePageClient.tsx').includes('BenzTechApp'));
    assert.equal(readSrc('src/app/page.tsx').includes('next/dynamic'), false);
  });
});