import * as Sentry from '@sentry/nextjs';
import { replayIntegration } from '@sentry/browser';
import { getSentryDsn } from '@/lib/sentryInit';

const dsn = getSentryDsn();
const isProduction = process.env.NODE_ENV === 'production';
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: isProduction ? 0 : 0.1,
    replaysOnErrorSampleRate: isProduction ? 0 : 1.0,
    integrations: [replayIntegration()],
    debug: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;