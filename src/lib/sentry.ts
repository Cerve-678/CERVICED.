// src/lib/sentry.ts
// Sentry wiring. Kept out of the hot path: initialises once, only when a DSN is
// configured, and forwards logger.reportError(...) → Sentry.captureException.
//
// Set the DSN via either:
//   • EXPO_PUBLIC_SENTRY_DSN   (env / .env — simplest), or
//   • app.json → expo.extra.sentryDsn
//
// With no DSN it no-ops (Sentry stays off; logger.error still prints to the
// terminal), so local dev / Expo Go is unaffected. Capturing NATIVE crashes
// needs a dev-client or EAS build — Expo Go can't load the native module.
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { setErrorReporter } from '../utils/logger';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  // Fallback init ONLY. If the Sentry wizard added `Sentry.init(...)` in App.tsx
  // (the recommended setup — it also wires native + source maps), a client
  // already exists and we must NOT init again. We self-init only when a DSN is
  // provided here AND nothing has initialised yet (e.g. wizard not run).
  const dsn =
    process.env['EXPO_PUBLIC_SENTRY_DSN'] ||
    (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn ||
    '';
  const hasClient =
    typeof (Sentry as { getClient?: () => unknown }).getClient === 'function' &&
    !!(Sentry as { getClient: () => unknown }).getClient();

  if (dsn && !hasClient) {
    Sentry.init({
      dsn,
      enabled: !__DEV__,   // report from release builds; flip to `true` to test in dev
      tracesSampleRate: 0, // errors only — no performance tracing (keeps it cheap)
      sendDefaultPii: false,
    });
  }

  // ALWAYS bridge logger.reportError(err, 'some:context') → Sentry, tagged so you
  // can filter by call-site (e.g. signup:addClientProfile). No-op until a client
  // exists (whether from the wizard's init above or the fallback), so it's safe
  // to wire regardless of who initialised Sentry.
  setErrorReporter((error, context) => {
    try {
      Sentry.captureException(error, context ? { tags: { context } } : undefined);
    } catch {
      // captureException must never take the app down.
    }
  });
}

export { Sentry };
