// The rules for charging a late-arrival or no-show fee, as one pure function
// so they can be unit-tested in isolation and reused verbatim by the
// booking-fee edge function. Zero imports on purpose (so jest and tsc can load
// it); the caller converts the booking's UK wall-clock times with londonTime.
//
// MODEL (user decisions 2026-10-12/13 — auto-memory late-and-no-show-fees-decision):
//   • the amount is the one frozen on the booking at checkout (already capped
//     at 50% of its price by the database), never a figure from the app
//   • only within 24 hours of the appointment's END, and not before it starts
//   • no-show: only once the provider has marked the booking a no-show
//   • late: only on a booking that actually went ahead
//   • only if the client agreed to fees when they paid, and paid by card in-app
//   • once per booking (the unique index enforces it; this gives the reason)

export type FeeKind = 'late' | 'no_show';

export const FEE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FeeEligibilityInput {
  kind: FeeKind;
  status: string;
  /** Appointment start/end as real instants (londonWallTimeToUtcMs). NaN if unknown. */
  startMs: number;
  endMs: number;
  lateFeePence: number | null;
  noShowFeePence: number | null;
  /** The booking was paid through Stripe in the app. */
  paidInApp: boolean;
  /** A fee_consent_records row exists for this booking's checkout, by this
   *  client, covering this booking's provider. */
  clientConsented: boolean;
  /** A non-failed fee row already exists for this booking. */
  alreadyCharged: boolean;
  nowMs: number;
}

export type FeeEligibility =
  | { ok: true; amountPence: number }
  | { ok: false; error: string };

const WENT_AHEAD = ['confirmed', 'in_progress', 'completed'];

export function checkFeeEligibility(input: FeeEligibilityInput): FeeEligibility {
  const amount = input.kind === 'late' ? input.lateFeePence : input.noShowFeePence;
  const label = input.kind === 'late' ? 'late arrival fee' : 'no-show fee';

  if (!amount || amount <= 0) return { ok: false, error: `This booking has no ${label} — the client didn't agree to one when they booked.` };
  if (!input.paidInApp || !input.clientConsented) {
    return { ok: false, error: `This client didn't save a card for fees when they booked, so a ${label} can't be charged in the app.` };
  }
  if (input.alreadyCharged) return { ok: false, error: 'A fee has already been charged for this booking.' };

  if (input.kind === 'no_show' && input.status !== 'no_show') {
    return { ok: false, error: 'Mark the booking as a no-show before charging the no-show fee.' };
  }
  if (input.kind === 'late' && !WENT_AHEAD.includes(input.status)) {
    return { ok: false, error: 'A late fee can only be charged on an appointment that went ahead.' };
  }

  const start = input.startMs;
  const end = input.endMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: 'This booking has no valid time.' };
  if (input.nowMs < start) return { ok: false, error: "You can't charge a fee before the appointment has started." };
  if (input.nowMs > end + FEE_WINDOW_MS) {
    return { ok: false, error: 'Fees can only be charged within 24 hours of the appointment, and that time has passed.' };
  }

  return { ok: true, amountPence: amount };
}

/** Statuses a booking can be in and still end up with a fee charged. */
export const FEE_POSSIBLE_STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'no_show'];

/**
 * When the card a booking was paid with stops being needed for an agreed fee:
 * 24 hours after the appointment ends. Null if the booking can't be charged a
 * fee at all (no fee agreed, already charged, or a status that rules it out),
 * or the window has already closed. User decision 2026-10-19: a client can't
 * remove that card until then.
 */
export function feeCardNeededUntilMs(input: {
  status: string;
  endMs: number;
  lateFeePence: number | null;
  noShowFeePence: number | null;
  alreadyCharged: boolean;
  nowMs: number;
}): number | null {
  if (!(input.lateFeePence ?? 0) && !(input.noShowFeePence ?? 0)) return null;
  if (input.alreadyCharged || !FEE_POSSIBLE_STATUSES.includes(input.status)) return null;
  if (!Number.isFinite(input.endMs)) return null;
  const until = input.endMs + FEE_WINDOW_MS;
  return input.nowMs < until ? until : null;
}
