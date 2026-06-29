import * as Sentry from '@sentry/nextjs';
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
    console.error('[Merlin] Sentry client init failed — continuing without telemetry', error);
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;