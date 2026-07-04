import 'server-only';

import { getGrokApiKey } from '@/lib/grokApiKey';
import { GROK_CHAT_MODEL, GROK_STORY_MODEL } from '@/lib/grokModels';
import { DIAGNOSTIC_EXTRACTION_PROMPT } from '@/prompts/diagnosticExtraction';
import { RO_EXTRACTION_PROMPT } from '@/prompts/roExtraction';
import {
  STORY_REVIEW_SYSTEM_PROMPT,
  STORY_SCORE_RETRY_SYSTEM_PROMPT,
  STORY_SCORE_SYSTEM_PROMPT,
  buildStoryReviewUserMessage,
  buildStoryScoreUserMessage,
  isStoryQualityDetailMissing,
  isStoryQualityParseFailure,
  parseStoryQualityResponse,
  pickRicherStoryQuality,
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
import { parseGrokApiErrorBody } from '@/lib/scanRouteErrors';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export { GROK_CHAT_MODEL, GROK_STORY_MODEL };

/** Full MI audit JSON (score + strengths + improvements + risks + technicianDetails). */
export const WARRANTY_STORY_SCORE_MAX_TOKENS = 1_400;

export function isGrokConfigured(): boolean {
  try {
    getGrokApiKey();
    return true;
  } catch {
    return false;
  }
}

export type GrokReasoningEffort = 'none' | 'low' | 'medium' | 'high';

function extractGrokMessageContent(apiResponse: unknown): string {
  const choices = (apiResponse as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> })
    ?.choices;
  const choice = choices?.[0];
  if (!choice) return '';

  const messageContent = choice.message?.content;
  if (typeof messageContent === 'string') return messageContent.trim();
  if (Array.isArray(messageContent)) {
    const textParts = messageContent
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const row = part as { type?: string; text?: string };
        return row.type === 'text' && typeof row.text === 'string' ? row.text : '';
      })
      .filter(Boolean);
    if (textParts.length) return textParts.join('\n').trim();
  }

  if (typeof choice.text === 'string') return choice.text.trim();
  return '';
}

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
      const detail = parseGrokApiErrorBody(errBody);
      logger.warn('grok.api_error', {
        status: response.status,
        bodyLength: errBody.length,
        detail: detail || undefined,
        perfLabel: options.perfLabel,
        model,
      });
      const suffix = detail ? ` — ${detail}` : '';
      throw new Error(`Grok API error: ${response.status}${suffix}`);
    }

    const apiResponse = await response.json();
    const content = extractGrokMessageContent(apiResponse);
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
  const trimmed = story?.trim();
  if (!trimmed) {
    throw new Error('AI did not return a warranty story. Try again or type the story manually.');
  }
  return trimmed;
}

async function requestStoryQualityScore(
  ro: RepairOrder,
  line: RepairLine,
  warrantyStory: string,
  systemPrompt: string,
  perfLabel: string
): Promise<StoryQualityResult> {
  const raw = await grokChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildStoryScoreUserMessage(ro, line, warrantyStory) },
    ],
    {
      model: GROK_STORY_MODEL,
      temperature: 0.1,
      max_tokens: WARRANTY_STORY_SCORE_MAX_TOKENS,
      timeoutMs: STORY_SCORE_GROK_MS,
      perfLabel,
      responseFormat: 'json_object',
    }
  );
  if (!raw.trim()) {
    logger.warn('grok.story.score_empty_response', { perfLabel, model: GROK_STORY_MODEL });
  }
  return parseStoryQualityResponse(raw);
}

export async function scoreWarrantyStory(
  ro: RepairOrder,
  line: RepairLine,
  warrantyStory: string
): Promise<StoryQualityResult> {
  const first = await requestStoryQualityScore(
    ro,
    line,
    warrantyStory,
    STORY_SCORE_SYSTEM_PROMPT,
    'grok.story.score'
  );
  const firstOk =
    !isStoryQualityParseFailure(first) && !isStoryQualityDetailMissing(first);
  if (firstOk) return first;

  logger.warn('grok.story.score_retry', {
    summary: first.summary,
    reason: isStoryQualityParseFailure(first) ? 'parse_failed' : 'missing_detail',
    detailCount: first.strengths.length + first.improvements.length + first.auditRisks.length,
  });
  const retry = await requestStoryQualityScore(
    ro,
    line,
    warrantyStory,
    STORY_SCORE_RETRY_SYSTEM_PROMPT,
    'grok.story.score_retry'
  );
  const best = pickRicherStoryQuality(first, retry);
  const bestOk =
    !isStoryQualityParseFailure(best) && !isStoryQualityDetailMissing(best);
  if (bestOk) return best;

  logger.error('grok.story.score_parse_failed', {
    summary: best.summary,
    firstSummary: first.summary,
    retrySummary: retry.summary,
    detailCount:
      best.strengths.length +
      best.improvements.length +
      best.auditRisks.length +
      best.technicianDetails.length,
  });
  return best;
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
      responseFormat: 'json_object',
    }
  );
  const parsed = parseStoryReviewResponse(raw);
  if (parsed.parseFailed) {
    logger.error('grok.story.review_parse_failed', {
      rawLength: raw.length,
      rawPreview: raw.slice(0, 500),
      summary: parsed.summary,
    });
  }
  return parsed;
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
    {
      temperature: 0.05,
      max_tokens: 2200,
      timeoutMs: RO_EXTRACT_GROK_MS,
      perfLabel: 'grok.ro.extract',
      reasoningEffort: 'none',
    }
  );
  return parseStructuredROText(extractedText);
}