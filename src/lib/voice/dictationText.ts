/** Join finalized speech chunks with a space when the engine omits word boundaries. */
export function appendDictationChunk(base: string, chunk: string): string {
  if (!chunk) return base;
  if (!base) return chunk;
  if (/\s$/.test(base) || /^\s/.test(chunk)) return base + chunk;
  if (/^[.,!?;:]/.test(chunk)) return base + chunk;
  return `${base} ${chunk}`;
}