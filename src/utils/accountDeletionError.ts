/**
 * Turns a refused delete_client_profile / delete_provider_profile result into
 * a message worth showing (as opposed to a raw error code).
 *
 * 'money_in_progress' carries account_deletion_blockers' list
 * (20261112110000): what on the account is still moving money. The account
 * can be deleted once all of it has finished.
 */
export interface AccountDeletionRefusal {
  error?: string;
  count?: number;
  blockers?: Record<string, number>;
  /** Which profile is being deleted, so the reasons read right to that person. */
  audience?: 'client' | 'provider';
}

const PROVIDER_PHRASES: Record<string, string> = {
  payouts_waiting: 'a payout still on its way to you',
  debts_owed: 'money you still owe from a refund or chargeback',
  fees_in_progress: 'a late or no-show fee still being paid',
  tips_waiting: 'a tip still on its way to you',
  refunds_processing: 'a refund to a client still going through',
  refunds_owed: 'a refund still owed to a client',
  refund_requests_open: "a client's refund request that is still open",
};

const CLIENT_PHRASES: Record<string, string> = {
  payouts_waiting: "a payment to your provider that hasn't gone out yet",
  fees_in_progress: 'a late or no-show fee still being paid',
  tips_waiting: 'a tip still on its way to your provider',
  refunds_processing: 'a refund to you still going through',
  refunds_owed: 'a refund still owed to you',
  refund_requests_open: 'a refund request that is still open',
};

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function accountDeletionError(data: AccountDeletionRefusal | null | undefined): Error {
  if (data?.error === 'upcoming_bookings') {
    const count = data.count ?? 0;
    return new Error(
      `You have ${count} upcoming appointment${count === 1 ? '' : 's'}. Please cancel or complete ${count === 1 ? 'it' : 'them'} first.`
    );
  }
  if (data?.error === 'money_in_progress') {
    const phrases = data.audience === 'client' ? CLIENT_PHRASES : PROVIDER_PHRASES;
    const reasons = Object.keys(data.blockers ?? {})
      .map(key => phrases[key])
      .filter((phrase): phrase is string => !!phrase);
    return new Error(reasons.length
      ? `You can't delete your account yet because there's ${list(reasons)}. You can delete it once that's finished.`
      : "You can't delete your account yet because a payment on it is still being settled. Please try again later.");
  }
  return new Error(data?.error || 'Could not delete your account.');
}
