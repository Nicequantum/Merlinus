import { isValidD7Number, normalizeD7Number } from '@/lib/d7Number';

export const CREDENTIAL_TYPES = ['email', 'd7', 'username', 'invalid'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

/** Generic login failure — never distinguish missing user vs wrong password. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APEX_USERNAME_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;

export function normalizeLoginIdentifier(raw: string): string {
  return raw.trim();
}

export function normalizeEmailIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeApexUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmailCredential(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes('@') && EMAIL_PATTERN.test(trimmed);
}

export function isApexUsernameCredential(value: string): boolean {
  return APEX_USERNAME_PATTERN.test(normalizeApexUsername(value));
}

/**
 * Detect credential type from a single login identifier.
 * Order matters: email before D7 before username.
 */
export function detectCredentialType(identifier: string): CredentialType {
  const trimmed = normalizeLoginIdentifier(identifier);
  if (!trimmed) return 'invalid';

  if (isEmailCredential(trimmed)) return 'email';
  if (isValidD7Number(trimmed)) return 'd7';
  if (isApexUsernameCredential(trimmed)) return 'username';
  return 'invalid';
}

/** Normalize identifier for DB lookup based on detected credential type. */
export function normalizeCredentialIdentifier(
  type: Exclude<CredentialType, 'invalid'>,
  identifier: string
): string {
  switch (type) {
    case 'email':
      return normalizeEmailIdentifier(identifier);
    case 'd7':
      return normalizeD7Number(identifier);
    case 'username':
      return normalizeApexUsername(identifier);
    default:
      return identifier.trim();
  }
}

/** Email is owner-only; D7 and username are dealership staff only. */
export function isCredentialRoleAllowed(credentialType: Exclude<CredentialType, 'invalid'>, role: string): boolean {
  if (credentialType === 'email') return role === 'owner';
  return role !== 'owner';
}