import { bookingIsoToDate, dateToBookingIso } from '../features/bookings/datePresentation';

describe('booking date presentation', () => {
  it('round-trips ISO calendar dates without locale parsing', () => {
    const date = bookingIsoToDate('2026-08-09');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(9);
    expect(dateToBookingIso(date)).toBe('2026-08-09');
  });

  it('falls back safely for invalid ISO input', () => {
    expect(bookingIsoToDate('not-a-date')).toBeInstanceOf(Date);
  });
});
