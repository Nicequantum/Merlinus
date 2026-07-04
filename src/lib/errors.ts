import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { logger } from './logger';
import { mapRouteError } from './routeErrorMapper';

export const GENERIC_ERROR = 'Something went wrong. Please try again or contact your administrator.';
export const UNAUTHORIZED_ERROR = 'You must be signed in to perform this action.';
export const FORBIDDEN_ERROR = 'You do not have permission to perform this action.';
export const NOT_FOUND_ERROR = 'The requested resource was not found.';
export const VALIDATION_ERROR = 'Invalid request. Please check your input and try again.';
export const RATE_LIMIT_ERROR = 'Too many requests. Please wait a moment and try again.';
export const DAILY_USAGE_LIMIT_ERROR =
  'Daily AI usage limit reached (50 requests per technician). Try again tomorrow.';
export const SESSION_EXPIRED_ERROR = 'Your session has expired. Please sign in again.';
export const CONSENT_REQUIRED_ERROR =
  'Data and privacy consent is required before using Merlinus. Please accept the consent terms to continue.';
export const LEGAL_DISCLAIMER_REQUIRED_ERROR =
  'Legal disclaimer acknowledgment is required before using Merlinus. Please accept the disclaimer to continue.';
export const MAINTENANCE_MODE_ERROR =
  'Merlinus is in maintenance mode. Story generation and uploads are paused — try again shortly.';
export const GROK_UNAVAILABLE_ERROR =
  'AI story generation is temporarily unavailable. Check bay Wi‑Fi or type your notes manually.';
export const IMAGE_ACCESS_ERROR =
  'This photo is not available for processing. Please re-upload and try again.';
export const IMAGE_STORAGE_ERROR =
  'Could not load uploaded photos from storage. Please re-upload and try again.';
export const PAYLOAD_TOO_LARGE_ERROR = 'Request is too large. Reduce attachments or split your input.';
export const OFFLINE_ERROR = 'No network connection. Your typed notes are safe — reconnect and try again.';
export const CONFLICT_ERROR =
  'This repair order was updated elsewhere. Reload the repair order to get the latest version.';

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === 'Unauthorized') {
    logger.warn('route.unauthorized', { context });
    return apiError(SESSION_EXPIRED_ERROR, 401);
  }

  const err = error instanceof Error ? error : new Error('unknown route error');
  const mapped = mapRouteError(error, context);

  logger.error(mapped.status >= 500 ? 'route.error' : 'route.client_error', {
    context,
    error: err.message,
    logDetail: mapped.logDetail,
    status: mapped.status,
  });
  Sentry.captureException(err, {
    tags: { routeContext: context },
    extra: { routeContext: context, logDetail: mapped.logDetail, status: mapped.status },
  });
  return apiError(mapped.message, mapped.status);
}