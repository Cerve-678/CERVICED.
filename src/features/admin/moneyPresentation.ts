import { formatShortDayDate } from '../../utils/dateUtils';
import type {
  AdminFailedPayout, AdminOwedShortfall, AdminRefundRequest, PayoutFailureCause,
} from '../../types/adminMoney';

// Wording for the admin Money screen's three lists. Display only: the server
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
