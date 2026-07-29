// src/utils/logger.ts
// Info (`log`) is dev-only to keep release output quiet. Warnings and errors are
// ALWAYS emitted — so a production/release build still surfaces them in a
// connected terminal (Metro, `npx react-native log-*`, Xcode, Logcat) — and are
// also forwarded to an external crash reporter (Sentry) when one is wired.

type Reporter = (error: unknown, context?: string) => void;

let externalReporter: Reporter | null = null;

/** Wire an external crash reporter (e.g. Sentry). See src/lib/sentry.ts. */
export function setErrorReporter(fn: Reporter | null): void {
  externalReporter = fn;
}

const noop = (..._args: unknown[]) => {};

export const logger = {
  log:   __DEV__ ? console.log.bind(console) : noop, // info — dev only
  warn:  console.warn.bind(console),                 // always (dev + prod)
  error: console.error.bind(console),                // always (dev + prod)
};

/**
 * Report an error. Always writes to the console (so it shows in the terminal,
 * even in a production build) and forwards to the external reporter (Sentry)
 * when one has been wired via setErrorReporter().
 */
export function reportError(error: unknown, context?: string): void {
  console.error(`[${context ?? 'app'}]`, error);
  try {
    externalReporter?.(error, context);
  } catch {
    // A failing reporter must never take the app down or mask the original error.
  }
}
