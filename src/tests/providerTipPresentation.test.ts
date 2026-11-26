import { formatTipAmount, providerTipNote, type ProviderBookingTip } from '../features/provider-bookings/tipPresentation';

const base: ProviderBookingTip = {
  amountPence: 1000,
  payoutPence: 1000,
  payoutStatus: 'held',
  releaseAfter: '2026-10-23T10:00:00Z',
};

describe('provider tip presentation', () => {
  it('shows the tip the client paid', () => {
    expect(formatTipAmount(base)).toBe('£10.00');
  });

  it('says it is all theirs and the payout day while held', () => {
    expect(providerTipNote(base, new Date('2026-10-22T10:00:00Z'))).toBe('All yours, paid out Fri 23 Oct');
  });

  it('says paying out soon once the hold has passed', () => {
    expect(providerTipNote(base, new Date('2026-10-24T10:00:00Z'))).toBe('All yours, paying out soon');
  });

  it('says paid out once transferred', () => {
    expect(providerTipNote({ ...base, payoutStatus: 'transferred' })).toBe('All yours, paid out');
  });

  it('never mentions a card fee to the provider', () => {
    for (const payoutStatus of ['pending', 'held', 'transferred', 'failed', 'cancelled', 'reversed'] as const) {
      expect(providerTipNote({ ...base, payoutStatus })).not.toMatch(/fee/i);
    }
  });
});
