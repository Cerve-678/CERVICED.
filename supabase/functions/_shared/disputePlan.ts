// Which bookings a bank dispute is about. Kept free of Deno imports so the
// app's jest suite can test it (src/tests/disputePlan.test.ts).
//
// One checkout is one card payment, but it can pay several bookings with
// several providers. A client's bank disputes the payment, not a booking: all
// Stripe tells us is the charge and an amount. Taking money back from every
// provider on the payment punishes the ones the client has no complaint
// about, so the dispute is matched to bookings by amount:
//
//   - one booking on the payment            -> that booking
//   - the amount equals exactly one set of
//     bookings (what each cost the client,
//     after refunds, or before them)        -> those bookings
//   - it equals every booking on the payment -> all of them (whole_charge)
//   - anything else, or two sets that both
//     fit (two £50 bookings, £50 disputed,
//     or one set after refunds and another
//     before them)                          -> an admin decides; until then
//                                              every booking's unpaid payout
//                                              waits and nothing is taken back
//   - no booking on it was paid in the app   -> nothing to take back

export interface DisputeCandidate {
  bookingId: string;
  /** What the card was charged for this booking, its fee share included (bookings.amount_paid). */
  paidPence: number;
  /** What has already gone back to the client for it (bookings.refunded_amount). */
  refundedPence: number;
}

export type DisputeAttribution =
  | { kind: 'single_booking' | 'amount' | 'whole_charge'; disputed: string[] }
  | { kind: 'needs_admin'; frozen: string[] };

/** Above this many paid bookings on one payment, sets aren't searched (2^n). */
export const MAX_BOOKINGS_TO_MATCH = 12;

export function planDisputeAttribution(disputePence: number, candidates: DisputeCandidate[]): DisputeAttribution {
  const paid = candidates
    .filter(c => Math.round(c.paidPence) > 0)
    .sort((a, b) => (a.bookingId < b.bookingId ? -1 : a.bookingId > b.bookingId ? 1 : 0));
  const allIds = paid.map(c => c.bookingId);
  // Nothing any provider could have been paid for: nothing to take or hold.
  if (paid.length === 0) return { kind: 'whole_charge', disputed: [] };
  if (paid.length === 1) return { kind: 'single_booking', disputed: allIds };
  if (paid.length > MAX_BOOKINGS_TO_MATCH) return { kind: 'needs_admin', frozen: allIds };

  const amount = Math.round(disputePence);
  const net = paid.map(c => ({ id: c.bookingId, pence: Math.max(0, Math.round(c.paidPence) - Math.round(c.refundedPence)) }));
  const gross = paid.map(c => ({ id: c.bookingId, pence: Math.round(c.paidPence) }));

  // A bank normally disputes what is still on the statement (after refunds),
  // but may dispute the original amount. Every set that fits either way is a
  // candidate; only one distinct set is a match.
  const candidatesFound = new Map<string, string[]>();
  for (const amounts of [net, gross]) {
    for (const set of setsSummingTo(amount, amounts.filter(a => a.pence > 0))) candidatesFound.set(set.join(), set);
  }
  const sets = [...candidatesFound.values()];
  const [disputed] = sets;
  if (sets.length === 1 && disputed) {
    return { kind: disputed.length === allIds.length ? 'whole_charge' : 'amount', disputed };
  }
  return { kind: 'needs_admin', frozen: allIds };
}

/** Every non-empty set of bookings whose amounts add up to `target`, ids sorted. */
function setsSummingTo(target: number, amounts: Array<{ id: string; pence: number }>): string[][] {
  if (target <= 0 || amounts.length === 0) return [];
  const found: string[][] = [];
  for (let mask = 1; mask < (1 << amounts.length); mask++) {
    const picked = amounts.filter((_, i) => mask & (1 << i));
    if (picked.reduce((sum, a) => sum + a.pence, 0) === target) found.push(picked.map(a => a.id));
  }
  return found;
}

/** What release-payouts does with a booking's payout when its charge is disputed. */
export type DisputePayoutVerdict = 'wait' | 'cancel' | 'pay';

export interface DisputeStateForBooking {
  /** null: no dispute on this charge was recorded (opened before this code, or the webhook missed it). */
  dispute: { closed: boolean; outcome: 'won' | 'lost' | null } | null;
  /** This booking's link to it, if any. */
  role: 'disputed' | 'frozen' | null;
}

/** A charge can (rarely) carry more than one dispute: the strictest answer wins. */
export function combineDisputeVerdicts(verdicts: DisputePayoutVerdict[]): DisputePayoutVerdict {
  if (verdicts.length === 0 || verdicts.includes('wait')) return 'wait';
  return verdicts.includes('cancel') ? 'cancel' : 'pay';
}

export function disputePayoutVerdict({ dispute, role }: DisputeStateForBooking): DisputePayoutVerdict {
  // Nothing recorded: we can't tell which bookings it covers, so hold them all.
  if (!dispute) return 'wait';
  // Not part of the dispute: the provider is owed as normal.
  if (role === null) return 'pay';
  // Waiting for an admin to say which bookings the dispute is about.
  if (role === 'frozen') return 'wait';
  if (!dispute.closed) return 'wait';
  // The bank sided with the client: that money went back to them.
  return dispute.outcome === 'lost' ? 'cancel' : 'pay';
}
