export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
  }
}