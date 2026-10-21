import { formatShortDayDate } from '../../utils/dateUtils';

export type ProviderBookingTip = {
  amountPence: number;
  /** What the provider gets after the card fee; null until the fee is known. */
  payoutPence: number | null;
  payoutStatus: 'pending' | 'held' | 'transferred' | 'failed' | 'cancelled' | 'reversed';
  releaseAfter: string | null;
};

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

/** The line under the provider's "Tip" row: what reaches them and when. */
export function providerTipNote(tip: ProviderBookingTip, now: Date = new Date()): string {
  const net = tip.payoutPence == null ? null : `${pounds(tip.payoutPence)} to you after the card fee`;
  switch (tip.payoutStatus) {
    case 'pending':
      return 'Processing. Your amount shows once the card fee is known.';
    case 'held': {
      const release = tip.releaseAfter ? new Date(tip.releaseAfter) : null;
      const when = release && release > now ? `paid out ${formatShortDayDate(release)}` : 'paying out soon';
      return net ? `${net}, ${when}` : when;
    }
    case 'transferred':
      return net ? `${net}, paid out` : 'Paid out';
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
