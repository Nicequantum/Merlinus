/**
 * Centralized environment validation for Merlinus.
 * Called at Node startup (instrumentation) and before production builds (scripts/validate-env.mjs).
 */

import { getExposedPublicGrokEnvKeys } from '@/lib/grokApiKey.shared';
import { logger } from '@/lib/logger';

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'ENCRYPTION_KEY', 'SESSION_SECRET'] as const;

/** Production hard requirement — RO and Xentry scanning cannot work without blob + vision AI. */
export const PRODUCTION_SCANNING_REQUIRED_ENV_VARS = [
  'BLOB_READ_WRITE_TOKEN',
  'GROK_API_KEY',
] as const;

/** H8: KV recommended in production for distributed rate limiting across serverless instances. */
const PRODUCTION_RECOMMENDED_ENV_VARS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN'] as const;

export interface EnvironmentValidationResult {
  missing: string[];
  warnings: string[];
  /** NEXT_PUBLIC_* xAI keys — security violation; must be deleted from all environments. */
  forbiddenPublicKeys: string[];
  valid: boolean;
}

export interface RuntimeConfig {
  appVersion: string;
  promptVersion: string;
  buildCommit: string;
  buildDate: string;
  maintenanceMode: boolean;
  nodeEnv: string;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/** True when MERLIN_MAINTENANCE_MODE is enabled — blocks AI routes and shows maintenance UI. */
export function isMaintenanceModeEnabled(): boolean {
  return isTruthyEnv(process.env.MERLIN_MAINTENANCE_MODE);
}

export function getBuildCommit(): string {
  return (
    process.env.NEXT_PUBLIC_BUILD_COMMIT?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    'dev'
  );
}

export function getBuildDate(): string {
  return process.env.NEXT_PUBLIC_BUILD_DATE?.trim() || new Date().toISOString();
}

export function getAppVersion(): string {
  return process.env.npm_package_version || '2.0.0';
}

export function validateEnvironment(options: { throwOnError?: boolean; production?: boolean } = {}): EnvironmentValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProduction = options.production ?? process.env.NODE_ENV === 'production';

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]?.trim()) {
      missing.push(key);
    }
  }

  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  if (encryptionKey) {
    if (encryptionKey.length < 32) {
      warnings.push('ENCRYPTION_KEY is shorter than 32 characters');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      warnings.push('ENCRYPTION_KEY should be 64 hex characters (openssl rand -hex 32)');
    }
  }

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret && sessionSecret.length < 32) {
    warnings.push('SESSION_SECRET is shorter than the recommended 32 characters');
  }

  for (const key of PRODUCTION_SCANNING_REQUIRED_ENV_VARS) {
    if (!process.env[key]?.trim()) {
      const scanMessage = `${key} not configured — RO and Xentry photo scanning disabled`;
      if (isProduction) {
        missing.push(key);
      } else {
        warnings.push(scanMessage);
      }
    }
  }

  const kvConfigured =
    Boolean(process.env.KV_REST_API_URL?.trim()) && Boolean(process.env.KV_REST_API_TOKEN?.trim());
  if (!kvConfigured) {
    warnings.push('KV_REST_API_URL/KV_REST_API_TOKEN not configured — distributed rate limiting disabled');
  } else if (isProduction) {
    for (const key of PRODUCTION_RECOMMENDED_ENV_VARS) {
      if (!process.env[key]?.trim()) {
        warnings.push(`${key} not configured — distributed rate limiting disabled`);
      }
    }
  }

  const forbiddenPublicKeys = getExposedPublicGrokEnvKeys();

  if (isProduction && isTruthyEnv(process.env.ALLOW_BOOTSTRAP)) {
    warnings.push(
      'ALLOW_BOOTSTRAP is set in production but bootstrap seed is permanently disabled — remove this variable'
    );
  }

  const valid = missing.length === 0 && forbiddenPublicKeys.length === 0;

  if (forbiddenPublicKeys.length > 0) {
    const message = `Forbidden public xAI API keys detected: ${forbiddenPublicKeys.join(', ')}. Delete them from Vercel and use server-only GROK_API_KEY.`;
    logger.error('env.validation_forbidden_public_keys', { forbiddenPublicKeys });
    if (options.throwOnError) {
      throw new Error(message);
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error('env.validation_failed', { missing });
    if (options.throwOnError) {
      throw new Error(message);
    }
  }

  for (const warning of warnings) {
    logger.warn('env.validation_warning', { warning });
  }

  return { missing, warnings, forbiddenPublicKeys, valid };
}

/** Stricter validation used by `npm run build` — fails on missing required vars. */
export function validateBuildEnvironment(): EnvironmentValidationResult {
  return validateEnvironment({ throwOnError: true, production: true });
}

/** Snapshot of non-secret runtime configuration for health/status endpoints. */
export function getRuntimeConfig(promptVersion: string): RuntimeConfig {
  return {
    appVersion: getAppVersion(),
    promptVersion,
    buildCommit: getBuildCommit(),
    buildDate: getBuildDate(),
    maintenanceMode: isMaintenanceModeEnabled(),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}