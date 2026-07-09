import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    const { loadApexEnvFile } = await import('./lib/apex/loadApexEnv');
    loadApexEnvFile({ override: true });

    const { getRuntimeConfig, validateEnvironment } = await import('./lib/env');
    const { PROMPT_VERSION } = await import('./prompts/version');
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const result = validateEnvironment({
      throwOnError: isProduction,
      production: isProduction,
    });
    const { logger } = await import('./lib/logger');
    const config = getRuntimeConfig(PROMPT_VERSION);
    logger.info('merlin.startup', {
      version: config.appVersion,
      promptVersion: config.promptVersion,
      commit: config.buildCommit,
      maintenance: config.maintenanceMode,
    });
    if (!result.valid) {
      logger.error('merlin.startup.env_invalid');
    }

    const { logSupabaseProductionReadiness } = await import('./lib/supabase');
    logSupabaseProductionReadiness();

    const { warmDatabaseConnectionInBackground } = await import('./lib/db');
    warmDatabaseConnectionInBackground();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;