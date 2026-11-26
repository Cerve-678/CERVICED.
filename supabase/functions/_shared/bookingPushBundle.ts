// One buzz per booking.
//
// Booking a service writes several client notifications within seconds of each
// other (booking confirmed or request sent, payment received, address shared,
// info pack, form). Each is its own row and stays in the Notifications list,
// but only the first one to reach the push sender buzzes the phone; the rest of
// the same booking, or the same checkout, go in quietly. Anything that arrives
// later than the window (an address released the day before, a request the
// provider accepts hours later) buzzes on its own as before.

export const BOOKING_BUNDLE_TYPES: ReadonlySet<string> = new Set([
  'booking_pending',
  'booking_confirmed',
  'payment_success',
  'address_released',
  'info_pack_received',
  'intake_form_received',
]);

export const BUNDLE_WINDOW_MINUTES = 10;

export interface BundleRecord {
  type: string;
  recipient_role: string | null | undefined;
  booking_id: string | null | undefined;
}

export interface ClaimedNotification {
  id: string;
  /** When the push sender claimed it (notifications.push_delivery_claimed_at). */
  claimedAt: string;
}

export interface SiblingNotification extends ClaimedNotification {
  type: string;
}

/** Client booking-time alerts that name a booking. Provider alerts never bundle. */
export function isBundleCandidate(record: BundleRecord): boolean {
  return record.recipient_role === 'client'
    && BOOKING_BUNDLE_TYPES.has(record.type)
    && !!record.booking_id;
}

/**
 * True when a sibling alert for the same booking or checkout already buzzed
 * the phone in the last BUNDLE_WINDOW_MINUTES, so this one should go quietly.
 *
 * "Already buzzed" means claimed by the push sender before this one (the same
 * instant is settled by id, so of two simultaneous alerts exactly one buzzes)
 * and allowed by the person's settings: a muted alert never buzzed, so it
 * mustn't silence one they do want.
 */
export function buzzedEarlier(
  me: ClaimedNotification,
  siblings: readonly SiblingNotification[],
  allowed: (type: string) => boolean,
): boolean {
  const mine = Date.parse(me.claimedAt);
  if (Number.isNaN(mine)) return false;
  const windowStart = mine - BUNDLE_WINDOW_MINUTES * 60 * 1000;
  return siblings.some((s) => {
    if (s.id === me.id || !allowed(s.type)) return false;
    const theirs = Date.parse(s.claimedAt);
    if (Number.isNaN(theirs) || theirs < windowStart) return false;
    return theirs < mine || (theirs === mine && s.id < me.id);
  });
}
