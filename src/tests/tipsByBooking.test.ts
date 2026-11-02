import { groupTipsByBooking } from '../features/payments/tipsByBooking';

describe('groupTipsByBooking', () => {
  it('puts each tip under the booking it was left on', () => {
    const tips = [{ id: 't1', bookingId: 'b1' }, { id: 't2', bookingId: 'b2' }];
    const { byBooking, unmatched } = groupTipsByBooking(['b1', 'b2'], tips);
    expect(byBooking.get('b1')).toEqual([tips[0]]);
    expect(byBooking.get('b2')).toEqual([tips[1]]);
    expect(unmatched).toEqual([]);
  });

  it('keeps tips on bookings outside the list instead of dropping them', () => {
    const tips = [{ id: 't1', bookingId: 'old' }];
    const { byBooking, unmatched } = groupTipsByBooking(['b1'], tips);
    expect(byBooking.size).toBe(0);
    expect(unmatched).toEqual(tips);
  });

  it('keeps more than one tip on the same booking, in order', () => {
    const tips = [{ id: 't1', bookingId: 'b1' }, { id: 't2', bookingId: 'b1' }];
    expect(groupTipsByBooking(['b1'], tips).byBooking.get('b1')).toEqual(tips);
  });
});
