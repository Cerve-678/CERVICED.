import { formatTipAmount, providerTipNote, type ProviderBookingTip } from '../features/provider-bookings/tipPresentation';

const base: ProviderBookingTip = {
  amountPence: 1000,
  payoutPence: 945,
  payoutStatus: 'held',
  releaseAfter: '2026-10-23T10:00:00Z',
};

describe('provider tip presentation', () => {
  it('shows the tip the client paid', () => {
    expect(formatTipAmount(base)).toBe('£10.00');
  });

  it('shows the amount after the card fee and the payout day while held', () => {
    expect(providerTipNote(base, new Date('2026-10-22T10:00:00Z'))).toBe('£9.45 to you after the card fee, paid out Fri 23 Oct');
  });

  it('says paying out soon once the hold has passed', () => {
    expect(providerTipNote(base, new Date('2026-10-24T10:00:00Z'))).toBe('£9.45 to you after the card fee, paying out soon');
  });

  it('never shows an amount before the card fee is known', () => {
    expect(providerTipNote({ ...base, payoutPence: null, payoutStatus: 'pending' })).toMatch(/^Processing/);
  });

  it('says paid out once transferred', () => {
    expect(providerTipNote({ ...base, payoutStatus: 'transferred' })).toBe('£9.45 to you after the card fee, paid out');
  });
});
