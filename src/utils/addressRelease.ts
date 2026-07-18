/**
 * Address-release policy — the single source of truth shared by the client
 * (BookingsScreen) and the provider (ProviderBookingDetailScreen), so both
 * sides reveal a provider's address at exactly the same moment and honour
 * whichever policy the provider actually set — not just 'on_confirmation'.
 *
 * Policies:
 *   always            → visible immediately
 *   on_confirmation   → visible once the booking is confirmed
 *   day_before …      → visible within N hours of the appointment (time-based)
 *   week_before
 *   manual            → never auto-releases; provider releases by hand
 */

export type AddressReleasePolicy =
  | 'always'
  | 'on_confirmation'
  | 'day_before'
  | 'two_days_before'
  | 'three_days_before'
  | 'five_days_before'
  | 'week_before'
  | 'manual'
  | null;

/** Hours before the appointment that each time-based policy releases the address. */
export const ADDRESS_RELEASE_POLICY_HOURS: Record<string, number> = {
  day_before: 24,
  two_days_before: 48,
  three_days_before: 72,
  five_days_before: 120,
  week_before: 168,
};

export interface AddressReleaseInput {
  /** The provider's configured policy (from provider settings). */
  policy: AddressReleasePolicy;
  /** True once the booking is past 'pending' (confirmed / in progress / completed). */
  isConfirmed: boolean;
  /** Appointment start time in epoch ms, or null when unknown. */
  appointmentAtMs: number | null;
  /** A concrete release timestamp — set by a manual release or the DB trigger. */
  addressReleasedAt: string | null | undefined;
  /** Override "now" (epoch ms); defaults to Date.now(). For tests. */
  now?: number;
}

/**
 * Whether the provider's full address should be visible for a booking.
 *
 * A concrete `addressReleasedAt` always wins (manual release / DB trigger);
 * otherwise the provider's policy decides. This is intentionally computed at
 * read time so the time-based policies flip to "released" automatically as the
 * appointment approaches — no scheduled job required.
 */
export function isAddressReleasedByPolicy(input: AddressReleaseInput): boolean {
  const { policy, isConfirmed, appointmentAtMs, addressReleasedAt } = input;
  const now = input.now ?? Date.now();

  if (addressReleasedAt) return true;
  if (policy === 'always') return true;
  if (policy === 'on_confirmation') return isConfirmed;

  const hours = policy ? ADDRESS_RELEASE_POLICY_HOURS[policy] : undefined;
  if (hours != null && appointmentAtMs != null && !Number.isNaN(appointmentAtMs)) {
    return (appointmentAtMs - now) / 3_600_000 <= hours;
  }

  // 'manual', null, or unknown → only the explicit timestamp (handled above).
  return false;
}
