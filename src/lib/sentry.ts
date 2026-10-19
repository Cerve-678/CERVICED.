// src/lib/sentry.ts
// Sentry itself is initialised by the Sentry wizard in App.tsx (Sentry.init +
// Sentry.wrap, plus native + source-map config). This module ONLY bridges
// logger.reportError(err, 'some:context') → Sentry.captureException, so errors
// the app turns into a friendly "something went wrong" still reach Sentry —
// tagged by call-site (e.g. signup:addClientProfile) for easy filtering. It uses
// the same Sentry client the wizard set up, so it's a no-op until init has run.
import * as Sentry from '@sentry/react-native';
import { setErrorReporter } from '../utils/logger';

let wired = false;

export function initSentry(): void {
  if (wired) return;
  wired = true;

  setErrorReporter((error, context) => {
    try {
      Sentry.captureException(error, context ? { tags: { context } } : undefined);
    } catch {
      // captureException must never take the app down.
    }
  });
}

/**
 * Records the duration of a user-visible async load without attaching booking
 * ids, names, addresses, notes, or any other customer data to Sentry.
 *
 * A forced transaction means the span remains useful even when a navigation
 * transaction is unavailable (for example, a screen restored from iOS state).
 */
export async function traceScreenLoad<T>(
  name: string,
  load: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      name,
      op: 'ui.load',
      forceTransaction: true,
    },
    async (span) => {
      const startedAt = Date.now();
      try {
        const value = await load();
        span.setAttributes({
          'ui.duration_ms': Date.now() - startedAt,
          'ui.outcome': 'ok',
        });
        return value;
      } catch (error) {
        span.setAttributes({
          'ui.duration_ms': Date.now() - startedAt,
          'ui.outcome': 'error',
        });
        throw error;
      }
    },
  );
}
