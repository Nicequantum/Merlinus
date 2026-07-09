/**
 * APEX NATIONAL PLATFORM — load .env.apex.local when APEX_ENV=1 (Phase 1.5).
 * MERLINUS SINGLE-DEALER: no-op when APEX_ENV is unset; Next.js uses .env.local only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let apexEnvLoaded = false;

export function isApexEnvEnabled(): boolean {
  const value = process.env.APEX_ENV?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

/**
 * Load .env.apex.local when APEX_ENV=1.
 * Existing process.env values win unless override=true.
 */
export function loadApexEnvFile(options: { override?: boolean } = {}): boolean {
  if (!isApexEnvEnabled()) return false;
  if (apexEnvLoaded && !options.override) return true;

  const path = resolve(process.cwd(), '.env.apex.local');
  if (!existsSync(path)) return false;

  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (options.override || !process.env[parsed.key]?.trim()) {
      process.env[parsed.key] = parsed.value;
    }
  }

  apexEnvLoaded = true;
  return true;
}

/** Reset loader state (unit tests). */
export function resetApexEnvLoadState(): void {
  apexEnvLoaded = false;
}