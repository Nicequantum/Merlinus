import { sanitizeIdentifier, sanitizeText } from '@/lib/sanitize';
import type { AuditAction } from '@/lib/audit';

/** M13: Fields that must never appear in durable audit metadata (PII / story text). */
const BLOCKED_METADATA_KEYS = new Set([
  'name',
  'displayName',
  'serviceAdvisorName',
  'customerName',
  'filename',
  'warrantyStory',
  'storyText',
  'technicianNotes',
  'vin',
  'password',
  'passwordHash',
]);

const ALLOWED_STRING_KEYS = new Set([
  'templateId',
  'templateTitle',
  'repairOrderId',
  'lineNumber',
  'd7Number',
  'role',
  'routeKey',
  'promptVersion',
  'systemPromptHash',
  'dealershipRulesHash',
  'miGuidelinesHash',
  'miStyleRulesHash',
  'advisorContextHash',
  'qualityGrade',
  'action',
  'reason',
]);

function sanitizePrimitive(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeText(value).slice(0, 500);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePrimitive(item));
  }
  if (value && typeof value === 'object') {
    return sanitizeAuditMetadata(value as Record<string, unknown>);
  }
  return undefined;
}

/**
 * M13: Strip PII and free-text story content from audit metadata before hash-chain storage.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
  _action?: AuditAction
): Record<string, unknown> {
  if (!metadata) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.has(key)) continue;

    if (key === 'd7Number' && typeof value === 'string') {
      sanitized[key] = sanitizeIdentifier(value);
      continue;
    }

    if (ALLOWED_STRING_KEYS.has(key) && typeof value === 'string') {
      sanitized[key] = sanitizeText(value).slice(0, 200);
      continue;
    }

    if (key.endsWith('Id') && typeof value === 'string') {
      sanitized[key] = sanitizeIdentifier(value);
      continue;
    }

    if (key.endsWith('Hash') && typeof value === 'string') {
      sanitized[key] = value.slice(0, 64);
      continue;
    }

    if (key.endsWith('Count') || key.endsWith('Score') || key === 'lineNumber') {
      sanitized[key] = value;
      continue;
    }

    if (key === 'knowledgeBaseEntryIds' && Array.isArray(value)) {
      sanitized[key] = value
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 20)
        .map((id) => sanitizeIdentifier(id));
      continue;
    }

    if (key === 'knowledgeBaseEntriesUsed' && Array.isArray(value)) {
      // Legacy: titles only — cap length, no story bodies.
      sanitized[key] = value
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 10)
        .map((t) => sanitizeText(t).slice(0, 80));
      continue;
    }

    const primitive = sanitizePrimitive(value);
    if (primitive !== undefined) {
      sanitized[key] = primitive;
    }
  }

  return sanitized;
}