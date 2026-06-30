import * as Sentry from '@sentry/nextjs';
import { clientLog } from '@/lib/clientLog';
import { getSentryDsn } from '@/lib/sentryInit';

const dsn = getSentryDsn();

if (dsn) {
  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      debug: false,
    });
  } catch (error) {
    clientLog.error('telemetry.sentry_init_failed', error);
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;