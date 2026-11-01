import { mergeBookingReviewStates } from '../features/bookings/reviewState';

describe('mergeBookingReviewStates', () => {
  it('keeps a paid tip on an unrated booking from reading as rated', () => {
    expect(mergeBookingReviewStates([], ['b1'])).toEqual([
      { bookingId: 'b1', reviewed: false, tipped: true },
    ]);
  });

  it('keeps a rated booking without a tip untipped', () => {
    expect(mergeBookingReviewStates(['b1'], [])).toEqual([
      { bookingId: 'b1', reviewed: true, tipped: false },
    ]);
  });

  it('returns one state per booking when both exist', () => {
    expect(mergeBookingReviewStates(['b1', 'b2'], ['b2'])).toEqual([
      { bookingId: 'b1', reviewed: true, tipped: false },
      { bookingId: 'b2', reviewed: true, tipped: true },
    ]);
  });
});
