import * as Sentry from '@sentry/nextjs';
import { redactForLog, redactString } from '@/lib/logRedact';
import { getRequestId } from '@/lib/requestContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubSentryEvent(event: any): any {
  if (event.extra && typeof event.extra === 'object') {
    event.extra = redactForLog(event.extra as Record<string, unknown>);
  }

  if (event.tags && typeof event.tags === 'object') {
    event.tags = redactForLog(event.tags as Record<string, unknown>);
  }

  if (event.request) {
    if (event.request.headers && typeof event.request.headers === 'object') {
      const headers = { ...event.request.headers } as Record<string, string>;
      for (const key of Object.keys(headers)) {
        if (/authorization|cookie|set-cookie|x-api-key/i.test(key)) {
          headers[key] = '[Redacted]';
        }
      }
      event.request.headers = headers;
    }
    if (typeof event.request.data === 'string') {
      event.request.data =
        event.request.data.length > 200
          ? `[Redacted body ${event.request.data.length} chars]`
          : redactString(event.request.data);
    } else if (event.request.data && typeof event.request.data === 'object') {
      event.request.data = redactForLog(event.request.data as Record<string, unknown>);
    }
    if (event.request.query_string && typeof event.request.query_string === 'string') {
      event.request.query_string = redactString(event.request.query_string, 200);
    }
  }

  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (value.value) value.value = redactString(value.value, 1000);
    }
  }

  const requestId = getRequestId();
  if (requestId) {
    event.tags = { ...event.tags, requestId };
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

/** Client Sentry scrubber (shared with instrumentation-client). */
export function scrubSentryEventForClient(event: unknown) {
  return scrubSentryEvent(event);
}
