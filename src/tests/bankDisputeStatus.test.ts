import {
  bankDisputeStates, bookingDisputeLabel, feeDisputeLabel, type BankDisputeStateRow,
} from '../features/payments/bankDisputeStatus';

const row = (over: Partial<BankDisputeStateRow>): BankDisputeStateRow => ({
  bookingId: 'b1', feeChargeId: null, role: 'disputed', closed: false, outcome: null, paidBackPence: 0, ...over,
});

describe('bankDisputeStates', () => {
  it('reads an open dispute on the booking', () => {
    expect(bankDisputeStates([row({})]).byBooking.get('b1')).toEqual({ stage: 'open', paidBackPence: 0 });
  });

  it('reads a frozen booking as waiting for a match, until the dispute is won', () => {
    expect(bankDisputeStates([row({ role: 'frozen' })]).byBooking.get('b1')?.stage).toBe('matching');
    // Lost before anyone matched it: still waiting.
    expect(bankDisputeStates([row({ role: 'frozen', closed: true, outcome: 'lost' })]).byBooking.get('b1')?.stage).toBe('matching');
    // Won before anyone matched it: nothing was taken, nothing to show.
    expect(bankDisputeStates([row({ role: 'frozen', closed: true, outcome: 'won' })]).byBooking.has('b1')).toBe(false);
  });

  it('carries what was paid back after a win', () => {
    expect(bankDisputeStates([row({ closed: true, outcome: 'won', paidBackPence: 4738 })]).byBooking.get('b1'))
      .toEqual({ stage: 'won', paidBackPence: 4738 });
  });

  it('lets an open dispute outrank a finished one on the same booking', () => {
    const state = bankDisputeStates([
      row({ closed: true, outcome: 'won', paidBackPence: 1000 }),
      row({}),
    ]).byBooking.get('b1');
    expect(state?.stage).toBe('open');
    expect(state?.paidBackPence).toBe(1000);
  });

  it('keeps a fee apart from its booking payment', () => {
    const { byBooking, byFee } = bankDisputeStates([row({ feeChargeId: 'f1', closed: true, outcome: 'lost' })]);
    expect(byBooking.has('b1')).toBe(false);
    expect(byFee.get('f1')?.stage).toBe('lost');
  });
});

describe('bookingDisputeLabel', () => {
  it('falls back to the normal status with no dispute', () => {
    expect(bookingDisputeLabel(undefined, 'held')).toBeNull();
  });

  it('says a payout is paid back once the dispute is won', () => {
    expect(bookingDisputeLabel({ stage: 'won', paidBackPence: 4738 }, 'reversed')).toBe('Paid back · dispute won');
  });

  it('shows the normal status for a win where nothing had been taken', () => {
    expect(bookingDisputeLabel({ stage: 'won', paidBackPence: 0 }, 'transferred')).toBeNull();
  });

  it('says why a payout is waiting', () => {
    expect(bookingDisputeLabel({ stage: 'open', paidBackPence: 0 }, 'held')).toBe('On hold · bank dispute');
    expect(bookingDisputeLabel({ stage: 'open', paidBackPence: 0 }, 'reversed')).toBe('Taken back · bank dispute open');
    expect(bookingDisputeLabel({ stage: 'matching', paidBackPence: 0 }, 'held')).toBe('On hold · bank dispute on this payment');
  });

  it('says a lost dispute was taken back, or never paid', () => {
    expect(bookingDisputeLabel({ stage: 'lost', paidBackPence: 0 }, 'reversed')).toBe('Taken back · bank dispute lost');
    expect(bookingDisputeLabel({ stage: 'lost', paidBackPence: 0 }, 'cancelled')).toBe('Not paid · bank dispute lost');
  });
});

describe('feeDisputeLabel', () => {
  it('says a won fee is on its way back, since support pays it back by hand', () => {
    expect(feeDisputeLabel({ stage: 'won', paidBackPence: 0 }, 'reversed')).toBe('Dispute won · being paid back');
    expect(feeDisputeLabel({ stage: 'won', paidBackPence: 0 }, 'transferred')).toBeNull();
  });

  it('says an open dispute on a fee', () => {
    expect(feeDisputeLabel({ stage: 'open', paidBackPence: 0 }, 'reversed')).toBe('Taken back · bank dispute open');
    expect(feeDisputeLabel({ stage: 'open', paidBackPence: 0 }, 'held')).toBe('On hold · bank dispute');
  });
});
