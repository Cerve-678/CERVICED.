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
