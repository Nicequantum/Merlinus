const PUBLIC_GROK_ENV_KEYS = [
  'NEXT_PUBLIC_GROK_API_KEY',
  'NEXT_PUBLIC_XAI_API_KEY',
  'NEXT_PUBLIC_XAI_KEY',
] as const;

export function getExposedPublicGrokEnvKeys(): string[] {
  return PUBLIC_GROK_ENV_KEYS.filter((name) => Boolean(process.env[name]?.trim()));
}

export function assertNoPublicGrokKeyExposure(): void {
  const exposed = getExposedPublicGrokEnvKeys();
  if (exposed.length > 0) {
    throw new Error(
      `${exposed.join(', ')} must not be set. Remove xAI API keys from frontend environment variables and use server-only GROK_API_KEY instead.`
    );
  }
}

/** Server-only xAI key — never use NEXT_PUBLIC_* variants. */
export function getGrokApiKey(): string {
  assertNoPublicGrokKeyExposure();
  const key = process.env.GROK_API_KEY?.trim();
  if (!key) {
    throw new Error('GROK_API_KEY is not configured on the server');
  }
  return key;
}