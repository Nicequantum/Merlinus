#!/usr/bin/env node
/**
 * Build-time environment validation — runs before `next build`.
 * Fails fast when critical secrets are missing in CI/production pipelines.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED = ['DATABASE_URL', 'ENCRYPTION_KEY', 'SESSION_SECRET'];
/** Must never be set — exposes xAI keys to the browser bundle. Use GROK_API_KEY only. */
const FORBIDDEN_PUBLIC_GROK_KEYS = [
  'NEXT_PUBLIC_GROK_API_KEY',
  'NEXT_PUBLIC_XAI_API_KEY',
  'NEXT_PUBLIC_XAI_KEY',
];
/** Required in production — RO/Xentry scanning uploads photos to Vercel Blob before Grok vision. */
const PRODUCTION_SCANNING_REQUIRED = ['BLOB_READ_WRITE_TOKEN', 'GROK_API_KEY'];
/** Required in production — distributed rate limiting must not fall back to per-instance memory. */
const PRODUCTION_REQUIRED = ['KV_REST_API_URL', 'KV_REST_API_TOKEN'];

function loadDotEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvFile('.env');
loadDotEnvFile('.env.local');
loadDotEnvFile('.env.production');

const isProduction =
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const exposedPublicGrokKeys = FORBIDDEN_PUBLIC_GROK_KEYS.filter((key) => process.env[key]?.trim());
if (exposedPublicGrokKeys.length > 0) {
  console.error(
    `[merlin:build] FORBIDDEN public xAI API keys: ${exposedPublicGrokKeys.join(', ')}`
  );
  console.error(
    '[merlin:build] Delete these from Vercel immediately. Use server-only GROK_API_KEY (no NEXT_PUBLIC_ prefix).'
  );
  process.exit(1);
}

const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`[merlin:build] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[merlin:build] Configure .env.local or your CI/CD secret store before building.');
  process.exit(1);
}

if (isProduction) {
  const missingScanning = PRODUCTION_SCANNING_REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missingScanning.length > 0) {
    console.error(
      `[merlin:build] Missing required scanning environment variables: ${missingScanning.join(', ')}`
    );
    console.error(
      '[merlin:build] RO and Xentry scanning require Vercel Blob (BLOB_READ_WRITE_TOKEN) and Grok vision (GROK_API_KEY).'
    );
    console.error(
      '[merlin:build] Vercel: Project → Storage → Create Blob Store → connect to this project (auto-injects BLOB_READ_WRITE_TOKEN).'
    );
    process.exit(1);
  }

  const missingProd = PRODUCTION_REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missingProd.length > 0) {
    console.error(
      `[merlin:build] Missing required production environment variables: ${missingProd.join(', ')}`
    );
    console.error(
      '[merlin:build] Configure Vercel KV / Upstash (KV_REST_API_URL + KV_REST_API_TOKEN) for distributed rate limiting.'
    );
    process.exit(1);
  }
} else {
  const missingScanning = PRODUCTION_SCANNING_REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missingScanning.length > 0) {
    console.warn(
      `[merlin:build] Scanning disabled until configured (optional for local builds): ${missingScanning.join(', ')}`
    );
  }
  const missingKv = PRODUCTION_REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missingKv.length > 0) {
    console.warn(
      `[merlin:build] Optional for local builds (rate limiting uses in-memory fallback): ${missingKv.join(', ')}`
    );
  }
}

function resolveCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA?.trim()) return process.env.VERCEL_GIT_COMMIT_SHA.trim();
  if (process.env.GIT_COMMIT?.trim()) return process.env.GIT_COMMIT.trim();
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

process.env.NEXT_PUBLIC_BUILD_COMMIT = resolveCommit();
process.env.NEXT_PUBLIC_BUILD_DATE = new Date().toISOString();

console.log(`[merlin:build] Environment OK — commit ${process.env.NEXT_PUBLIC_BUILD_COMMIT}`);