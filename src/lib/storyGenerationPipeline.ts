import { GROK_STORY_MODEL } from '@/lib/grokModels';
import {
  STORY_GENERATE_CLIENT_MS,
  STORY_GENERATE_GROK_MS,
  STORY_GENERATE_ROUTE_MAX_DURATION_S,
} from '@/lib/timeouts';
import {
  SYSTEM_PROMPT,
  WARRANTY_STORY_MAX_TOKENS,
  buildWarrantyStoryUserMessage,
} from '@/prompts/warrantyStory';
import type { RepairLine, RepairOrder } from '@/types';

/** Snapshot of the live story-generation pipeline for perf investigations. */
export interface StoryGenerationPipelineAudit {
  model: string;
  reasoningEffort: string;
  systemPromptChars: number;
  userMessageChars: number;
  totalPromptChars: number;
  maxOutputTokens: number;
  preGrokDbOps: string[];
  excludedFromPrompt: string[];
  timeouts: {
    grokMs: number;
    routeMaxDurationS: number;
    clientMs: number;
  };
}

export function resolveStoryReasoningEffort(model: string): string {
  if (model.includes('non-reasoning')) return 'not used (non-reasoning model)';
  if (model.includes('grok-4')) return 'none';
  return 'not sent';
}

export function auditStoryGenerationPipeline(ro: RepairOrder, line: RepairLine): StoryGenerationPipelineAudit {
  const userMessage = buildWarrantyStoryUserMessage(ro, line);
  return {
    model: GROK_STORY_MODEL,
    reasoningEffort: resolveStoryReasoningEffort(GROK_STORY_MODEL),
    systemPromptChars: SYSTEM_PROMPT.length,
    userMessageChars: userMessage.length,
    totalPromptChars: SYSTEM_PROMPT.length + userMessage.length,
    maxOutputTokens: WARRANTY_STORY_MAX_TOKENS,
    preGrokDbOps: ['prisma.repairOrder.findUnique (RO + lines)', 'dbToRepairOrder field decrypt'],
    excludedFromPrompt: [
      'knowledgeBase',
      'historyContext',
      'advisorIntelligence',

      'storyTemplates',
      'roLevelOcr',
      'allRepairLineDescriptions',
    ],
    timeouts: {
      grokMs: STORY_GENERATE_GROK_MS,
      routeMaxDurationS: STORY_GENERATE_ROUTE_MAX_DURATION_S,
      clientMs: STORY_GENERATE_CLIENT_MS,
    },
  };
}