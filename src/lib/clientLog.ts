/** Client-side structured diagnostics — mirrors server logger JSON format. */

type LogLevel = 'warn' | 'error';

const isDev = process.env.NODE_ENV === 'development';

function normalizeContext(context?: unknown): Record<string, unknown> | undefined {
  if (context === undefined) return undefined;
  if (context instanceof Error) {
    return { error: context.message, stack: context.stack };
  }
  if (typeof context === 'object' && context !== null && !Array.isArray(context)) {
    return context as Record<string, unknown>;
  }
  return { detail: context };
}

function write(level: LogLevel, message: string, context?: unknown): void {
  if (level === 'warn' && !isDev) return;

  const normalized = normalizeContext(context);
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: 'merlinus-client',
    ...normalized,
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.warn(line);
}

export const clientLog = {
  warn: (message: string, context?: unknown) => write('warn', message, context),
  error: (message: string, context?: unknown) => write('error', message, context),
};