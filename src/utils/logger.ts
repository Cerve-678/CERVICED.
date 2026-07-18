// src/utils/logger.ts
// Production-safe logger — zero console output outside __DEV__

const noop = (..._args: unknown[]) => {};

export const logger = {
  log:   __DEV__ ? console.log.bind(console)   : noop,
  warn:  __DEV__ ? console.warn.bind(console)  : noop,
  error: __DEV__ ? console.error.bind(console) : noop,
};

/**
 * Report an error with optional context string.
 * In dev: logs to console. In prod: no-op (wire Sentry here when added).
 */
export function reportError(error: unknown, context?: string): void {
  if (__DEV__) {
    console.error(`[${context ?? 'app'}]`, error);
  }
  // TODO: wire Sentry here when added — Sentry.captureException(error, { tags: { context } })
}
