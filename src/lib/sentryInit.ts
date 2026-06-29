import * as Sentry from '@sentry/nextjs';

const PII_KEY_PATTERN =
  /^(customerName|vin|warrantyStory|storyText|technicianNotes|password|passwordHash|displayName|serviceAdvisorName|complaints?)$/i;

function scrubSentryEvent<T extends { request?: { data?: unknown }; extra?: Record<string, unknown> }>(
  event: T
): T {
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (PII_KEY_PATTERN.test(key)) {
        event.extra[key] = '[Redacted]';
      }
    }
  }

  if (event.request?.data && typeof event.request.data === 'string') {
    if (event.request.data.length > 500) {
      event.request.data = `[Redacted body ${event.request.data.length} chars]`;
    }
  }

  return event;
}

export function getSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function initSentryServer(): void {
  const dsn = getSentryDsn();
  if (!dsn) return;

  // H-5: 0.2 in production — balances latency/error visibility with cost and noise at dealership scale
  // (full sampling inflated Sentry quota without improving warranty-workflow triage).
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  Sentry.init({
    dsn,
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    debug: false,
    beforeSend: scrubSentryEvent,
  });
}

export function initSentryEdge(): void {
  const dsn = getSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    debug: false,
    beforeSend: scrubSentryEvent,
  });
}