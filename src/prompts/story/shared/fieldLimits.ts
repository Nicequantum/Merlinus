/** Field caps — enough diagnostic context without bloating the user message. */
export const PROMPT_FIELD_LIMITS = {
  ocr: 500,
  notes: 900,
  concern: 400,
} as const;

export function truncatePromptField(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}
