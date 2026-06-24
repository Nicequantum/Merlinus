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
    const config = getRuntimeConfig(PROMPT_VERSION);
    console.log(
      `[merlin:startup] v${config.appVersion} prompt=${config.promptVersion} commit=${config.buildCommit} maintenance=${config.maintenanceMode}`
    );
    if (!result.valid) {
      console.error('[merlin:startup] Environment validation failed — see logs above');
    }
  }
}