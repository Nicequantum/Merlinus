/**
 * APEX NATIONAL PLATFORM — deployment mode (no server-only deps; safe for unit tests).
 *
 * PLATFORM_MODE controls national Apex vs single-dealer Merlinus experience:
 * - merlinus (default): legacy D7 login and Tiverton behavior
 * - apex: unified credential login and national platform features
 */

export const PLATFORM_MODES = ['merlinus', 'apex'] as const;
export type PlatformMode = (typeof PLATFORM_MODES)[number];

export function parsePlatformMode(raw: string | undefined | null): PlatformMode {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) return 'merlinus';
  if ((PLATFORM_MODES as readonly string[]).includes(normalized)) {
    return normalized as PlatformMode;
  }
  throw new Error(`Invalid PLATFORM_MODE "${raw}" — expected merlinus or apex`);
}

export function getPlatformMode(): PlatformMode {
  return parsePlatformMode(process.env.PLATFORM_MODE);
}

export function isApexPlatformMode(): boolean {
  return getPlatformMode() === 'apex';
}

export function isMerlinusPlatformMode(): boolean {
  return getPlatformMode() === 'merlinus';
}