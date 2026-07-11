/**
 * Phase 7.2 (H10) — per-request correlation id for logs, Sentry, and response headers.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestContextStore {
  requestId: string;
  routeKey?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export function createRequestId(incoming?: string | null): string {
  const trimmed = incoming?.trim();
  if (trimmed && /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getRequestContext(): RequestContextStore | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  ctx: RequestContextStore,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return storage.run(ctx, fn);
}

/** Prefer inbound X-Request-Id when present (gateway / client correlation). */
export function resolveRequestIdFromRequest(request: Request): string {
  return createRequestId(request.headers.get(REQUEST_ID_HEADER));
}

export function applyRequestIdHeader(response: Response, requestId: string): void {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
  } catch {
    // immutable response — ignore
  }
}
