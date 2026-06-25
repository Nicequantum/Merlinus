/** Client-side diagnostics — suppressed in production to keep tablet consoles clean. */

const isDev = process.env.NODE_ENV === 'development';

export const clientLog = {
  warn: (message: string, context?: unknown) => {
    if (isDev) console.warn(message, context ?? '');
  },
  error: (message: string, context?: unknown) => {
    if (isDev) console.error(message, context ?? '');
  },
};