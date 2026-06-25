import { createHash } from 'crypto';
import { MI_AUDIT_GUIDELINES, MI_GENERATION_STYLE_RULES } from '@/prompts/miAuditGuidelines';
import { SYSTEM_PROMPT } from '@/prompts/warrantyStory';
import { getDealershipPromptRules, PROMPT_VERSION } from '@/prompts/version';

/** M6: Hash a string for audit metadata without storing raw sensitive content. */
export function hashPromptFragment(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

export interface PromptAuditFingerprint {
  promptVersion: string;
  systemPromptHash: string;
  dealershipRulesHash: string | null;
  miGuidelinesHash: string;
  miStyleRulesHash: string;
}

/** M6: Record which prompt building blocks were active — not just static PROMPT_VERSION. */
export function buildPromptAuditFingerprint(): PromptAuditFingerprint {
  const dealershipRules = getDealershipPromptRules();
  return {
    promptVersion: PROMPT_VERSION,
    systemPromptHash: hashPromptFragment(SYSTEM_PROMPT),
    dealershipRulesHash: dealershipRules ? hashPromptFragment(dealershipRules) : null,
    miGuidelinesHash: hashPromptFragment(MI_AUDIT_GUIDELINES),
    miStyleRulesHash: hashPromptFragment(MI_GENERATION_STYLE_RULES),
  };
}

export function buildStoryGenerateAuditMetadata(input: {
  repairOrderId: string;
  lineNumber: number;
  advisorIntelligenceUsed: boolean;
  advisorContextHash: string | null;
  knowledgeBaseEntryIds: string[];
  historyContextLineCount: number;
  qualityScore: number | null;
  qualityGrade: string | null;
  serviceAdvisorId: string | null;
}): Record<string, unknown> {
  const fingerprint = buildPromptAuditFingerprint();
  return {
    repairOrderId: input.repairOrderId,
    lineNumber: input.lineNumber,
    ...fingerprint,
    advisorIntelligenceUsed: input.advisorIntelligenceUsed,
    advisorContextHash: input.advisorContextHash,
    knowledgeBaseEntryIds: input.knowledgeBaseEntryIds,
    historyContextLineCount: input.historyContextLineCount,
    qualityScore: input.qualityScore,
    qualityGrade: input.qualityGrade,
    serviceAdvisorId: input.serviceAdvisorId,
  };
}