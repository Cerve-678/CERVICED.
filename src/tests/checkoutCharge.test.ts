import { chargeWasApproved } from '../../supabase/functions/_shared/checkoutCharge';

describe('chargeWasApproved', () => {
  it('counts an approval, including one cancelled before capture', () => {
    expect(chargeWasApproved({ status: 'succeeded', captured: false })).toBe(true);
  });

  it('does not count a declined attempt', () => {
    expect(chargeWasApproved({ status: 'failed' })).toBe(false);
  });

  it('does not count no charge, or a charge that was not expanded', () => {
    expect(chargeWasApproved(null)).toBe(false);
    expect(chargeWasApproved('ch_123')).toBe(false);
  });
});
