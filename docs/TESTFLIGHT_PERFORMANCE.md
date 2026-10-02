# TestFlight performance investigation — 2 October 2026

Reported device: iPhone 17 Pro Max. Reported build: 48. Symptoms: general slowness and intermittent blank screen on opening.

## Confirmed code defects and local fixes

1. `App.tsx` awaited `loadBookmarks()` before mounting the provider/navigation tree and hiding the splash. That function performs a Supabase network read before consulting local storage. Slow/unavailable network therefore blocked first render. Startup now waits only for bundled font loading (or its error); local defaults initialise independently. Home already fetches bookmarks after authentication, so the extra startup request is removed.
2. `subscribeToAuthStateChanges` passed an async handler straight to Supabase. `AuthContext` awaited a profile query inside it. The installed `@supabase/auth-js` invokes and awaits callbacks while holding its session lock, which that query needs to obtain its access token. This can deadlock session restoration/sign-in and subsequent requests. The adapter now schedules handlers outside the lock, cancels queued callbacks on unsubscribe, and reports handler failures.
3. With event handlers no longer blocking authentication, profile requests may overlap session changes. Profile loads now carry a generation check so an obsolete response cannot overwrite a newer account or restore a signed-out account.

These findings are from the current workspace. Build 48's exact source revision and device logs have not been retrieved, so attribution of every reported symptom to these defects remains unverified.

## Follow-up: Expo Go and provider diary

The user confirmed Expo Go eventually loaded, but remained slow, particularly the provider diary. The diary now starts appointment loading alongside its setup-profile request when AuthContext has already resolved the provider ID. Refresh and realtime reloads reuse that ID, and realtime subscription setup no longer makes its own duplicate profile request. On a cold launch where the ID is not yet known, the existing profile-based fallback remains.

Startup/font loading and authentication loading now show the bundled CERVICED logo. The native splash plugin also uses that artwork; this native configuration takes effect in a new build. Expo Go's own initial loading screen is outside the app's control. These visual changes do not establish a measured latency improvement.

A direct localhost Expo-server diagnostic was not executed: automatic approval review failed due to an account usage limit. No device connection or runtime timing was verified through that diagnostic.

## Regression coverage

- Auth callback returns before a session-dependent request executes.
- A stalled profile handler does not block later auth events.
- Unsubscribe cancels queued work; rejected handlers are reported.
- A delayed profile response cannot undo sign-out or replace a newer account.
- Navigation mounts even when optional startup storage never resolves (provider internals mocked).

## Release verification still required

Ship these changes in a new TestFlight build and record its source revision. On the reported phone, measure cold launch, warm resume after token expiry, Home, Search, provider profile, and bookings. Repeat with a slow connection and offline, including an existing persisted login. Capture any blank-screen occurrence time and match it to Sentry/native device logs. Distinguish time to visible UI, time to usable data, animation stalls, and process termination.

Sentry currently captures errors but has performance tracing disabled (`tracesSampleRate: 0`). Existing error reports alone cannot establish screen or API latency. Obtain release-device timings/profiles before making broader rendering changes; enable only appropriately scoped, non-sensitive telemetry if instrumentation is added.

No backend capacity claim is established by these fixes. Separately measure request volume per journey, API/database p50/p95 latency, slow query plans, database connections/CPU, and realtime fan-out under realistic concurrent users in a staging environment. Avoid production booking/payment writes during load tests. Use those measurements to prioritise query consolidation, caching, indexes, pagination, or capacity changes.

Supabase reference: https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
