// When a declined late/no-show fee is tried again on the saved card (user
// decision 2026-10-19, migration 20261019210000): at most three retries, about
// 1, 3 and 6 days into the request's 7 days, and only for agreements on
// wording that says so. Zero imports on purpose, so jest and tsc can load it
// (same as bookingFeePlan.ts).

export const RETRY_DAYS = [1, 3, 6] as const;

/** Fee terms versions whose wording allows automatic retries. */
const RETRY_TERMS_VERSIONS = new Set(['2026-10-19-retries']);

export function termsAllowRetries(version: string | null | undefined): boolean {
  return !!version && RETRY_TERMS_VERSIONS.has(version);
}

/** When retry number `done + 1` is due, or null when there are no more. */
export function nextRetryAt(requestedAtMs: number, done: number, payByMs: number): string | null {
  const days = RETRY_DAYS[done];
  if (days === undefined) return null;
  const at = requestedAtMs + days * 86_400_000;
  return at < payByMs ? new Date(at).toISOString() : null;
}
