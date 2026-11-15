import { formatShortDayDate } from '../../utils/dateUtils';
import type {
  AdminBankDispute, AdminFailedPayout, AdminOwedShortfall, AdminRefundRequest, PayoutFailureCause,
} from '../../types/adminMoney';

// Wording for the admin Money screen's lists. Display only: the server
// decides what can be retried or declined and refuses anything else.

/** Mirrors PAYOUT_MAX_ATTEMPTS in supabase/functions/_shared/payoutRetry.ts
 *  (a test keeps the two equal): the first try plus three automatic retries. */
export const PAYOUT_MAX_ATTEMPTS = 4;

export const formatPence = (pence: number) => `£${(Number(pence) / 100).toFixed(2)}`;

function day(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return formatShortDayDate(new Date(iso));
  } catch {
    return null;
  }
}

const WHY: Record<PayoutFailureCause, string> = {
  platform_balance: "The app's Stripe balance was too low.",
  provider_account: "Their Stripe account can't receive money yet.",
  other: 'Stripe refused it.',
};

export interface FailedPayoutView {
  key: string;
  name: string;
  amount: string;
  why: string;
  tries: string;
  /** Show "Try payment again now". */
  canRetry: boolean;
  /** Shown instead of the button while the provider has to act first. */
  waitingNote: string | null;
}

export function describeFailedPayout(f: AdminFailedPayout): FailedPayoutView {
  const waitingOnProvider = f.status === 'held' && f.failure_cause === 'provider_account';
  const next = day(f.next_try_at);
  return {
    key: f.payout_id,
    name: f.provider_name || 'Unknown provider',
    amount: formatPence(f.amount_pence),
    why: WHY[f.failure_cause ?? 'other'],
    tries: f.status === 'held'
      ? `Tried ${f.attempt_count} of ${PAYOUT_MAX_ATTEMPTS}.${next ? ` Next automatic try: ${next}.` : ''}`
      : `Tried ${f.attempt_count} ${f.attempt_count === 1 ? 'time' : 'times'}. No more automatic tries.`,
    canRetry: !waitingOnProvider,
    waitingNote: waitingOnProvider
      ? "The provider has been told to fix their Stripe account. It'll try again by itself."
      : null,
  };
}

const OWED_WHY: Record<AdminOwedShortfall['source'], string> = {
  refund: 'A client was refunded after this provider had already been paid.',
  cancellation: 'A cancellation refund came after this provider had already been paid.',
  fee_refund: 'A late or no-show fee was refunded after this provider had already been paid.',
  bank_dispute: "The client's bank took the money back after this provider had been paid.",
};

export function describeOwed(o: AdminOwedShortfall) {
  return {
    key: o.shortfall_id,
    name: o.provider_name || 'Unknown provider',
    amount: formatPence(o.owed_pence),
    why: OWED_WHY[o.source],
    plan: 'Comes out of their next payment automatically.',
  };
}

export interface RefundRequestView {
  key: string;
  client: string;
  amount: string;
  /** What's left to give back, in pence. */
  remainingPence: number;
  service: string;
  status: string;
  needsYou: boolean;
}

export function describeRefundRequest(r: AdminRefundRequest, now: Date): RefundRequestView {
  const needsYou = r.status === 'under_review';
  const since = Date.parse(r.created_at);
  const dayNumber = Number.isFinite(since) ? Math.max(1, Math.floor((now.getTime() - since) / 86_400_000) + 1) : 1;
  const remainingPence = Math.max(0, r.paid_pence - r.refunded_pence);
  return {
    key: r.request_id,
    client: r.client_name || 'Client',
    amount: formatPence(remainingPence),
    remainingPence,
    service: `${r.service_name || 'Booking'} · ${r.provider_name || 'Unknown provider'}`,
    status: needsYou ? 'NEEDS YOU' : `WITH PROVIDER · DAY ${dayNumber}`,
    needsYou,
  };
}

/** Pence from what the admin typed ("45", "45.5", "£45.50"), or null if it isn't an amount. */
export function parsePounds(text: string): number | null {
  const cleaned = text.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence > 0 ? pence : null;
}

/** Stripe's reason codes, in words. Anything else shows as Stripe sent it. */
const DISPUTE_REASON: Record<string, string> = {
  fraudulent: "Says they didn't make the payment",
  product_not_received: "Says they didn't get the service",
  product_unacceptable: 'Unhappy with the service',
  duplicate: 'Says they were charged twice',
  subscription_canceled: 'Says they had cancelled',
  credit_not_processed: 'Says a refund never arrived',
  unrecognized: "Doesn't recognise the payment",
  general: 'No specific reason',
};

export interface BankDisputeBookingView {
  key: string;
  title: string;
  detail: string;
  amount: string;
  /** This booking's amount (after refunds) is exactly what was disputed. */
  matchesAmount: boolean;
}

export interface BankDisputeView {
  key: string;
  amount: string;
  reason: string;
  status: string;
  /** Lost before anyone picked: the bank kept the money. */
  lost: boolean;
  /** Decided, but the take-back didn't finish: its bookings are already
   *  ticked and pressing again finishes it. */
  unfinished: boolean;
  bookings: BankDisputeBookingView[];
}

export function describeBankDispute(d: AdminBankDispute): BankDisputeView {
  const opened = day(d.opened_at);
  const lost = d.closed && d.outcome === 'lost';
  return {
    key: d.dispute_id,
    amount: formatPence(d.amount_pence),
    reason: (d.reason && DISPUTE_REASON[d.reason]) || d.reason || 'No reason given',
    status: d.unfinished
      ? "DIDN'T FINISH · PRESS AGAIN"
      : lost ? 'LOST · PICK THE BOOKING' : `OPEN${opened ? ` · SINCE ${opened.toUpperCase()}` : ''}`,
    lost,
    unfinished: d.unfinished,
    bookings: d.bookings.map(b => {
      const left = Math.max(0, b.paid_pence - b.refunded_pence);
      return {
        key: b.booking_id,
        title: `${b.service_name || 'Booking'} · ${b.provider_name || 'Unknown provider'}`,
        detail: [b.booking_date ? day(b.booking_date) : null, b.client_name, b.refunded_pence > 0 ? `${formatPence(b.refunded_pence)} refunded` : null]
          .filter(Boolean).join(' · '),
        amount: formatPence(left),
        matchesAmount: left === d.amount_pence || b.paid_pence === d.amount_pence,
      };
    }),
  };
}
