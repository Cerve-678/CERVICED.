// src/utils/logger.ts
// Info (`log`) is dev-only to keep release output quiet. Warnings and errors are
// ALWAYS emitted — so a production/release build still surfaces them in a
// connected terminal (Metro, `npx react-native log-*`, Xcode, Logcat) — and are
// also forwarded to an external crash reporter (Sentry) when one is wired.
//
// Every warn/error (and, in dev, every log) is also kept in an in-memory ring
// buffer so they're visible on-device via Developer Settings → Debug Logs,
// without needing a tethered Metro/Xcode console — see getLogBuffer() below.

type Reporter = (error: unknown, context?: string) => void;

let externalReporter: Reporter | null = null;

/** Wire an external crash reporter (e.g. Sentry). See src/lib/sentry.ts. */
export function setErrorReporter(fn: Reporter | null): void {
  externalReporter = fn;
}

export type LogLevel = 'log' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
}

const MAX_LOG_ENTRIES = 300;
const logBuffer: LogEntry[] = [];
const bufferListeners = new Set<() => void>();

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function pushToBuffer(level: LogLevel, args: unknown[]): void {
  logBuffer.push({ level, timestamp: Date.now(), message: formatArgs(args) });
  if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
  bufferListeners.forEach((fn) => fn());
}

/** Snapshot of the current buffered log entries, oldest first. */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
  bufferListeners.forEach((fn) => fn());
}

/** Subscribe to buffer changes (new entry or clear). Returns an unsubscribe fn. */
export function subscribeToLogBuffer(fn: () => void): () => void {
  bufferListeners.add(fn);
  return () => bufferListeners.delete(fn);
}

const noop = (..._args: unknown[]) => {};

export const logger = {
  // info — dev only, both the console write and the buffer capture
  log: __DEV__
    ? (...args: unknown[]) => {
        pushToBuffer('log', args);
        console.log(...args);
      }
    : noop,
  // always (dev + prod)
  warn: (...args: unknown[]) => {
    pushToBuffer('warn', args);
    console.warn(...args);
  },
  // always (dev + prod)
  error: (...args: unknown[]) => {
    pushToBuffer('error', args);
    console.error(...args);
  },
};

/**
 * Report an error. Always writes to the console (so it shows in the terminal,
 * even in a production build), is captured in the on-device log buffer, and
 * forwards to the external reporter (Sentry) when one has been wired via
 * setErrorReporter().
 */
export function reportError(error: unknown, context?: string): void {
  logger.error(`[${context ?? 'app'}]`, error);
  try {
    externalReporter?.(error, context);
  } catch {
    // A failing reporter must never take the app down or mask the original error.
  }
}
