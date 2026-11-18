import type { BookingFeeCharge, BookingFeeKind, BookingFeeTerms } from '../../services/databaseService';

// Display-side mirror of supabase/functions/_shared/bookingFeePlan.ts, so the
// booking screen only offers what the server would accept. The server is the
// enforcement point; booking times are read as device-local like the rest of
// the app (UK wall clock for UK users).

export const FEE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FEE_DISPUTE_MS = 7 * 24 * 60 * 60 * 1000;
const WENT_AHEAD = ['confirmed', 'in_progress', 'completed'];

/** The fee that counts: the newest attempt that didn't fail. */
export function liveFee(charges: BookingFeeCharge[]): BookingFeeCharge | null {
  return charges.find(c => c.status !== 'failed') ?? null;
}

export interface FeeChargeWindow {
  open: boolean;
  canCharge: Record<BookingFeeKind, boolean>;
  closesAtLabel: string;
}

export const feeKindLabel = (kind: BookingFeeKind): string =>
  kind === 'late' ? 'late arrival fee' : kind === 'no_show' ? 'no-show fee' : 'late cancellation fee';

/** Mirror of the server's isLateClientCancel plus the conditions booking-fee
 *  adds for a late cancellation fee: the client's own late cancel of a booking
 *  they paid only a deposit on, under the half-price policy frozen on it. */
export function isChargeableLateCancel(terms: BookingFeeTerms): boolean {
  if (terms.status !== 'cancelled' || terms.cancelledBy !== 'client' || !terms.cancelledAt) return false;
  // Never on a request the provider hadn't accepted.
  if (!terms.confirmedAt) return false;
  if (terms.paymentStatus !== 'deposit_paid') return false;
  if (terms.cancelPenalty !== 'half' && terms.cancelPenalty !== 'full') return false;
  if (!(terms.cancelNoticeHours > 0)) return false;
  if (terms.lateRescheduleFrom) return true;
  const start = new Date(`${terms.bookingDate}T${terms.bookingTime}`).getTime();
  const cancelled = Date.parse(terms.cancelledAt);
  const hoursUntil = Number.isFinite(start) && Number.isFinite(cancelled) ? (start - cancelled) / 3_600_000 : 0;
  return hoursUntil >= 0 && hoursUntil < terms.cancelNoticeHours;
}

export function feeChargeWindow(terms: BookingFeeTerms, nowMs: number): FeeChargeWindow {
  const start = new Date(`${terms.bookingDate}T${terms.bookingTime}`).getTime();
  const end = new Date(`${terms.bookingDate}T${terms.endTime ?? terms.bookingTime}`).getTime();
  const closes = end + FEE_WINDOW_MS;
  const valid = Number.isFinite(start) && Number.isFinite(end) && nowMs <= closes;
  // Visit fees wait for the appointment to start; a late cancel comes before it.
  const visitOpen = valid && nowMs >= start;
  const lateCancel = valid && !!terms.lateCancelFeePence && isChargeableLateCancel(terms);
  return {
    open: visitOpen || lateCancel,
    canCharge: {
      late: visitOpen && !!terms.lateFeePence && WENT_AHEAD.includes(terms.status),
      no_show: visitOpen && !!terms.noShowFeePence && terms.status === 'no_show',
      late_cancel: lateCancel,
    },
    closesAtLabel: new Date(closes).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
  };
}

/** A client can dispute a charged fee for 7 days. */
export function feeDisputeOpen(charge: BookingFeeCharge, nowMs: number): boolean {
  if (charge.status !== 'succeeded' || !charge.chargedAt) return false;
  return nowMs <= new Date(charge.chargedAt).getTime() + FEE_DISPUTE_MS;
}

export interface FeeToCharge {
  bookingId: string;
  customerName: string | null;
  serviceName: string | null;
  bookingDate: string;
  /** The fees open on it right now, e.g. ['late arrival fee']. */
  kinds: BookingFeeKind[];
  closesAtLabel: string;
}

/** Bookings with a fee the provider can still charge, soonest-closing first:
 *  inside the window, nothing already charged or in progress (a failed
 *  attempt can be tried again). Payments & payouts lists these. */
export function feesToChargeNow(
  candidates: readonly { bookingId: string; customerName: string | null; serviceName: string | null; terms: BookingFeeTerms; charges: readonly Pick<BookingFeeCharge, 'status'>[] }[],
  nowMs: number,
): FeeToCharge[] {
  const out: (FeeToCharge & { closes: number })[] = [];
  for (const c of candidates) {
    if (c.charges.some(ch => ch.status !== 'failed')) continue;
    const window = feeChargeWindow(c.terms, nowMs);
    if (!window.open) continue;
    const kinds = (['late', 'no_show', 'late_cancel'] as const).filter(k => window.canCharge[k]);
    if (kinds.length === 0) continue;
    const end = new Date(`${c.terms.bookingDate}T${c.terms.endTime ?? c.terms.bookingTime}`).getTime();
    out.push({
      bookingId: c.bookingId,
      customerName: c.customerName,
      serviceName: c.serviceName,
      bookingDate: c.terms.bookingDate,
      kinds,
      closesAtLabel: window.closesAtLabel,
      closes: end,
    });
  }
  return out.sort((a, b) => a.closes - b.closes).map(({ closes: _closes, ...rest }) => rest);
}
