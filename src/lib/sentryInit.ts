import * as Sentry from '@sentry/nextjs';
import { redactForLog, redactString } from '@/lib/logRedact';
import { getRequestId } from '@/lib/requestContext';

/** Mutate Sentry event in place for secret scrubbing (Phase 7.2). */
function scrubSentryEventInPlace(event: Record<string, unknown>): void {
  if (event.extra && typeof event.extra === 'object') {
    event.extra = redactForLog(event.extra as Record<string, unknown>);
  }

  if (event.tags && typeof event.tags === 'object') {
    event.tags = redactForLog(event.tags as Record<string, unknown>);
  }

  const request = event.request as
    | {
        data?: unknown;
        headers?: Record<string, string>;
        query_string?: unknown;
      }
    | undefined;

  if (request) {
    if (request.headers && typeof request.headers === 'object') {
      const headers = { ...request.headers };
      for (const key of Object.keys(headers)) {
        if (/authorization|cookie|set-cookie|x-api-key/i.test(key)) {
          headers[key] = '[Redacted]';
        }
      }
      request.headers = headers;
    }
    if (typeof request.data === 'string') {
      request.data =
        request.data.length > 200
          ? `[Redacted body ${request.data.length} chars]`
          : redactString(request.data);
    } else if (request.data && typeof request.data === 'object') {
      request.data = redactForLog(request.data as Record<string, unknown>);
    }
    if (request.query_string && typeof request.query_string === 'string') {
      request.query_string = redactString(request.query_string, 200);
    }
  }

  const exception = event.exception as { values?: Array<{ value?: string }> } | undefined;
  if (exception?.values) {
    for (const value of exception.values) {
      if (value.value) value.value = redactString(value.value, 1000);
    }
  }

  const requestId = getRequestId();
  if (requestId) {
    const tags =
      event.tags && typeof event.tags === 'object'
        ? (event.tags as Record<string, unknown>)
        : {};
    event.tags = { ...tags, requestId };
  }
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
    beforeSend(event) {
      scrubSentryEventInPlace(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}

export function initSentryEdge(): void {
  const dsn = getSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    debug: false,
    beforeSend(event) {
      scrubSentryEventInPlace(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}

/** Client Sentry scrubber (shared with instrumentation-client). */
export function scrubSentryEventForClient(event: unknown) {
  if (event && typeof event === 'object') {
    scrubSentryEventInPlace(event as Record<string, unknown>);
  }
  return event;
}
