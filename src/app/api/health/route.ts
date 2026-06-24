import { withAuth } from '@/lib/apiRoute';
import { aggregateHealthStatus, runAuthenticatedHealthChecks } from '@/lib/healthChecks';
import { getRuntimeConfig } from '@/lib/env';
import { logger } from '@/lib/logger';
import { PROMPT_VERSION } from '@/prompts/version';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

/**
 * C5: Manager-authenticated, minimal health — no live Grok calls, no env/infrastructure leakage.
 */
export async function GET(request: Request) {
  return withAuth(
    request,
    async () => {
      const checks = await runAuthenticatedHealthChecks();
      const status = aggregateHealthStatus(checks);

      if (status === 'error') {
        logger.warn('health.degraded', {
          status,
          failed: Object.entries(checks)
            .filter(([, c]) => c.status === 'error')
            .map(([name]) => name),
        });
      }

      const config = getRuntimeConfig(PROMPT_VERSION);
      const payload = {
        status,
        version: config.appVersion,
        promptVersion: PROMPT_VERSION,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
        services: Object.fromEntries(
          Object.entries(checks).map(([name, check]) => [name, check.status])
        ),
      };

      const statusCode = status === 'error' ? 503 : 200;
      return Response.json(payload, {
        status: statusCode,
        headers: { 'Cache-Control': 'no-store' },
      });
    },
    { rateLimitKey: 'health', requireManager: true }
  );
}