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

export function feeChargeWindow(terms: BookingFeeTerms, nowMs: number): FeeChargeWindow {
  const start = new Date(`${terms.bookingDate}T${terms.bookingTime}`).getTime();
  const end = new Date(`${terms.bookingDate}T${terms.endTime ?? terms.bookingTime}`).getTime();
  const closes = end + FEE_WINDOW_MS;
  const open = Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= closes;
  return {
    open,
    canCharge: {
      late: open && !!terms.lateFeePence && WENT_AHEAD.includes(terms.status),
      no_show: open && !!terms.noShowFeePence && terms.status === 'no_show',
    },
    closesAtLabel: new Date(closes).toLocaleString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
  };
}

/** A client can dispute a charged fee for 7 days. */
export function feeDisputeOpen(charge: BookingFeeCharge, nowMs: number): boolean {
  if (charge.status !== 'succeeded' || !charge.chargedAt) return false;
  return nowMs <= new Date(charge.chargedAt).getTime() + FEE_DISPUTE_MS;
}
