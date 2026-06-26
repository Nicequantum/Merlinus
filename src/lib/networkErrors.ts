/** True when fetch failed before an HTTP response (offline, DNS, CORS transport, etc.). */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('failed to fetch') || message.includes('networkerror when attempting to fetch resource')) {
      return true;
    }
    if (error.name === 'NetworkError') return true;
  }
  return false;
}

export const NETWORK_RETRY_MAX_ATTEMPTS = 3;
export const NETWORK_RETRY_BASE_MS = 300;

export function networkRetryDelayMs(attempt: number): number {
  return NETWORK_RETRY_BASE_MS * 2 ** attempt;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}