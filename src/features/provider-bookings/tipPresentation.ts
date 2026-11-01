import { formatShortDayDate } from '../../utils/dateUtils';

export type ProviderBookingTip = {
  amountPence: number;
  /** What the provider is paid: the whole tip. */
  payoutPence: number | null;
  payoutStatus: 'pending' | 'held' | 'transferred' | 'failed' | 'cancelled' | 'reversed';
  releaseAfter: string | null;
};

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

/** The line under the provider's "Tip" row: when it reaches them. The whole tip
 *  is theirs: CERVICED covers the card fee (user, 2026-10-21). */
export function providerTipNote(tip: ProviderBookingTip, now: Date = new Date()): string {
  switch (tip.payoutStatus) {
    case 'pending':
      return 'Processing';
    case 'held': {
      const release = tip.releaseAfter ? new Date(tip.releaseAfter) : null;
      return release && release > now
        ? `All yours, paid out ${formatShortDayDate(release)}`
        : 'All yours, paying out soon';
    }
    case 'transferred':
      return 'All yours, paid out';
    case 'reversed':
      return 'Reversed by the client\'s bank';
    case 'failed':
    case 'cancelled':
      return 'Payout delayed. Contact support if it doesn\'t arrive.';
  }
}

export function formatTipAmount(tip: ProviderBookingTip): string {
  return pounds(tip.amountPence);
}
