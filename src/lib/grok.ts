import 'server-only';

import { getGrokApiKey } from '@/lib/grokApiKey';
import { GROK_CHAT_MODEL, GROK_STORY_MODEL } from '@/lib/grokModels';
import { DIAGNOSTIC_EXTRACTION_PROMPT } from '@/prompts/diagnosticExtraction';
import { RO_EXTRACTION_PROMPT } from '@/prompts/roExtraction';
import {
  STORY_REVIEW_SYSTEM_PROMPT,
  STORY_SCORE_SYSTEM_PROMPT,
  buildStoryReviewUserMessage,
  buildStoryScoreUserMessage,
  isStoryQualityParseFailure,
  parseStoryQualityResponse,
  parseStoryReviewResponse,
  type StoryQualityResult,
  type StoryReviewResult,
} from '@/prompts/storyQuality';
import { PROMPT_VERSION } from '@/prompts/version';
import {
  SYSTEM_PROMPT,
  WARRANTY_STORY_MAX_TOKENS,
  WARRANTY_STORY_TEMPERATURE,
  buildWarrantyStoryUserMessage,
} from '@/prompts/warrantyStory';

export { PROMPT_VERSION };
import type { ExtractedData, RepairLine, RepairOrder } from '@/types';
import { normalizeExtractedData, parseDiagnosticExtractionJson } from '@/utils/diagnosticParser';
import { logPerformance } from '@/lib/perf';
import {
  DIAGNOSTIC_EXTRACT_GROK_MS,
  RO_EXTRACT_GROK_MS,
  STORY_GENERATE_GROK_MS,
  STORY_REVIEW_GROK_MS,
  STORY_SCORE_GROK_MS,
} from '@/lib/timeouts';
import { parseStructuredROText } from '@/utils/roExtractor';
import { logger } from '@/lib/logger';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export { GROK_CHAT_MODEL, GROK_STORY_MODEL };

/** JSON quality score responses rarely exceed ~500 tokens. */
export const WARRANTY_STORY_SCORE_MAX_TOKENS = 650;

export function isGrokConfigured(): boolean {
  try {
    getGrokApiKey();
    return true;
  } catch {
    return false;
  }
}

export type GrokReasoningEffort = 'none' | 'low' | 'medium' | 'high';

async function grokChat(
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>,
  options: {
    temperature: number;
    max_tokens: number;
    timeoutMs?: number;
    perfLabel?: string;
    model?: string;
    /** Only sent for grok-4.x models — grok-3 ignores reasoning. */
    reasoningEffort?: GrokReasoningEffort;
    /** Request JSON object output from the chat API when supported. */
    responseFormat?: 'json_object';
  }
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 55_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const model = options.model ?? GROK_CHAT_MODEL;
  const reasoningEffort = options.reasoningEffort ?? 'none';

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
  };
  // Only reasoning-capable grok-4 models accept this param; non-reasoning variants must omit it.
  if (model.includes('grok-4') && !model.includes('non-reasoning')) {
    requestBody.reasoning_effort = reasoningEffort;
  }
  if (options.responseFormat === 'json_object') {
    requestBody.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getGrokApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.warn('grok.api_error', {
        status: response.status,
        bodyLength: errBody.length,
      });
      throw new Error(`Grok API error: ${response.status}`);
    }

    const apiResponse = await response.json();
    const content = apiResponse.choices?.[0]?.message?.content?.trim() || '';
    logPerformance(options.perfLabel || 'grok.chat', Date.now() - startedAt, {
      model,
      maxTokens: options.max_tokens,
      reasoningEffort: model.includes('grok-4') ? reasoningEffort : 'n/a',
      outcome: 'ok',
    });
    return content;
  } catch (error) {
    logPerformance(options.perfLabel || 'grok.chat', Date.now() - startedAt, {
      model,
      outcome: 'error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Grok API timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateWarrantyStory(ro: RepairOrder, line: RepairLine): Promise<string> {
  const userMessage = buildWarrantyStoryUserMessage(ro, line);
  const story = await grokChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    {
      model: GROK_STORY_MODEL,
      temperature: WARRANTY_STORY_TEMPERATURE,
      max_tokens: WARRANTY_STORY_MAX_TOKENS,
      timeoutMs: STORY_GENERATE_GROK_MS,
      perfLabel: 'grok.story.generate',
    }
  );
  return story || 'No story generated.';
}

export async function scoreWarrantyStory(
  ro: RepairOrder,
  line: RepairLine,
  warrantyStory: string
): Promise<StoryQualityResult> {
  const raw = await grokChat(
    [
      { role: 'system', content: STORY_SCORE_SYSTEM_PROMPT },
      { role: 'user', content: buildStoryScoreUserMessage(ro, line, warrantyStory) },
    ],
    {
      model: GROK_STORY_MODEL,
      temperature: 0.1,
      max_tokens: WARRANTY_STORY_SCORE_MAX_TOKENS,
      timeoutMs: STORY_SCORE_GROK_MS,
      perfLabel: 'grok.story.score',
      responseFormat: 'json_object',
    }
  );
  const quality = parseStoryQualityResponse(raw);
  if (isStoryQualityParseFailure(quality)) {
    throw new Error('AI quality score returned unreadable JSON.');
  }
  return quality;
}

export async function reviewWarrantyStory(
  ro: RepairOrder,
  line: RepairLine,
  warrantyStory: string
): Promise<StoryReviewResult> {
  const raw = await grokChat(
    [
      { role: 'system', content: STORY_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: buildStoryReviewUserMessage(ro, line, warrantyStory) },
    ],
    {
      temperature: 0.15,
      max_tokens: 1400,
      timeoutMs: STORY_REVIEW_GROK_MS,
      perfLabel: 'grok.story.review',
      reasoningEffort: 'none',
    }
  );
  return parseStoryReviewResponse(raw);
}

export async function extractDiagnosticsFromImage(imageDataUrl: string): Promise<ExtractedData> {
  const raw = await grokChat(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: DIAGNOSTIC_EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    { temperature: 0.05, max_tokens: 900, timeoutMs: DIAGNOSTIC_EXTRACT_GROK_MS, perfLabel: 'grok.diagnostics.extract' }
  );

  const parsed = parseDiagnosticExtractionJson(raw);
  if (!parsed) {
    throw new Error('Could not parse diagnostic extraction from Grok response');
  }
  return normalizeExtractedData(parsed);
}

export async function extractROFromImages(imageDataUrls: string[]) {
  const imageContents = imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } }));
  const extractedText = await grokChat(
    [
      {
        role: 'user',
        content: [{ type: 'text', text: RO_EXTRACTION_PROMPT }, ...imageContents],
      },
    ],
    { temperature: 0.05, max_tokens: 2800, timeoutMs: RO_EXTRACT_GROK_MS, perfLabel: 'grok.ro.extract' }
  );
  return parseStructuredROText(extractedText);
}