// What release-payouts does after a provider transfer fails: when to try
// again, and how to describe the failure to support and to the provider; and
// the wording of the daily money summary built from money_needing_attention().
// Pure and import-free, so src/tests can pin it (the Deno functions apply it).
//
// Three automatic retries, about 1, 2 and 4 days after each failure (user
// decision 2026-10-21). After the last one the payout is marked 'failed' and
// waits for a person: the admin screen's "Try payment again now".

export const PAYOUT_RETRY_DELAYS_DAYS = [1, 2, 4] as const;
/** The first try plus every automatic retry. */
export const PAYOUT_MAX_ATTEMPTS = PAYOUT_RETRY_DELAYS_DAYS.length + 1;

/**
 * When to try again after the `attempts`-th failed try (1 = the first try
 * failed), or null when that was the last automatic one.
 */
export function nextPayoutRetryAt(attempts: number, now: Date): Date | null {
  const delayDays = PAYOUT_RETRY_DELAYS_DAYS[attempts - 1];
  if (delayDays === undefined) return null;
  return new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
}

/**
 * Whose problem a failed transfer is. 'platform_balance': the app's own Stripe
 * balance couldn't cover it, which fixes itself as client payments settle.
 * 'provider_account': the provider's Stripe account can't receive money yet,
 * which only they can fix, so they're told. 'other': anything else.
 */
export type TransferFailureCause = 'platform_balance' | 'provider_account' | 'other';

const PROVIDER_ACCOUNT_CODES = new Set([
  'account_invalid',
  'account_closed',
  'insufficient_capabilities_for_transfer',
  'transfers_not_allowed',
  'payouts_not_allowed',
]);

export function classifyTransferFailure(err: unknown): TransferFailureCause {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code ?? '') : '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (code === 'balance_insufficient' || /insufficient (available )?funds|balance_insufficient/i.test(message)) {
    return 'platform_balance';
  }
  if (PROVIDER_ACCOUNT_CODES.has(code) || /capabilit|destination account|account (is )?(closed|restricted|rejected)/i.test(message)) {
    return 'provider_account';
  }
  return 'other';
}

/** One plain line for support's email and the admin screen. */
export function describeTransferFailure(cause: TransferFailureCause): string {
  switch (cause) {
    case 'platform_balance': return "The app's Stripe balance was too low to send it.";
    case 'provider_account': return "The provider's Stripe account can't receive money yet.";
    default: return 'Stripe refused the transfer.';
  }
}

// ── The daily summary ───────────────────────────────────────────────────────
// The shape money_needing_attention() returns (see
// 20261024121000_payout_retries_and_alerts.sql).
export interface MoneyAttention {
  failed: Array<{
    payout_id: string;
    provider_name: string | null;
    amount_pence: number;
    status: 'held' | 'failed';
    attempt_count: number;
    failure_cause: TransferFailureCause | null;
    next_try_at: string | null;
  }>;
  owed: Array<{ shortfall_id: string; provider_name: string | null; owed_pence: number }>;
  refunds: Array<{
    request_id: string;
    status: 'with_provider' | 'under_review';
    client_name: string | null;
    provider_name: string | null;
    service_name: string | null;
    paid_pence: number;
    refunded_pence: number;
  }>;
}

const pounds = (pence: number) => `£${(Number(pence) / 100).toFixed(2)}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });

/** One row of the daily email (moneySummaryEmail in emailTemplates.ts). */
export interface MoneySummaryLine {
  title: string;
  amount: string;
}

export function summarizeMoneyAttention(data: MoneyAttention): {
  failed: MoneySummaryLine[];
  owed: MoneySummaryLine[];
  refunds: MoneySummaryLine[];
} {
  return {
    failed: (data.failed ?? []).map((f) => {
      const who = f.provider_name || 'Unknown provider';
      const why = describeTransferFailure(f.failure_cause ?? 'other').replace(/\.$/, '');
      const when = f.status === 'held' && f.next_try_at
        ? `next try ${day(f.next_try_at)}`
        : `tried ${f.attempt_count} of ${PAYOUT_MAX_ATTEMPTS} times, needs you`;
      return { title: `${who}: ${why}. ${when[0]!.toUpperCase()}${when.slice(1)}`, amount: pounds(f.amount_pence) };
    }),
    owed: (data.owed ?? []).map((o) => ({
      title: `${o.provider_name || 'Unknown provider'}: comes out of their next payment`,
      amount: pounds(o.owed_pence),
    })),
    refunds: (data.refunds ?? []).map((r) => ({
      title: `${r.status === 'under_review' ? 'Needs you' : 'With the provider'}: ${r.client_name || 'Client'}, ${r.service_name || 'booking'} with ${r.provider_name || 'their provider'}`,
      amount: pounds(Math.max(0, r.paid_pence - r.refunded_pence)),
    })),
  };
}
