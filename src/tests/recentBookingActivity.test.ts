import { describeRecentBooking } from '../features/providers/recentBookingActivity';
import type { BookingWithAddOns } from '../types/database';

function booking(overrides: Partial<BookingWithAddOns>): BookingWithAddOns {
  return {
    id: 'b1',
    status: 'confirmed',
    booking_date: '2026-11-10',
    booking_time: '14:30:00',
    base_price: 45,
    add_ons_total: 10,
    service_name_snapshot: 'Knotless braids',
    customer_name: 'Amara Obi',
    created_at: '2026-11-08T09:00:00.000Z',
    add_ons: [],
    ...overrides,
  } as BookingWithAddOns;
}

describe('describeRecentBooking', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');

  it('says what was booked, by whom, for when, how long ago and for how much', () => {
    expect(describeRecentBooking(booking({}), now)).toEqual({
      service: 'Knotless braids',
      detail: 'Amara Obi · for Tue 10 Nov, 2:30pm',
      booked: 'Booked 3h ago',
      price: '£55.00',
      status: 'Upcoming',
      statusColor: '#007AFF',
    });
  });

  it('reads the made-at time as a moment, not that day at midnight', () => {
    expect(describeRecentBooking(booking({ created_at: '2026-11-08T11:59:40.000Z' }), now).booked).toBe('Booked just now');
    expect(describeRecentBooking(booking({ created_at: '2026-11-08T11:20:00.000Z' }), now).booked).toBe('Booked 40m ago');
    expect(describeRecentBooking(booking({ created_at: '2026-11-06T12:00:00.000Z' }), now).booked).toBe('Booked 2d ago');
    expect(describeRecentBooking(booking({ created_at: '2026-10-27T12:00:00.000Z' }), now).booked).toBe('Booked Tue 27 Oct');
  });

  it('falls back plainly when the name, service or time is missing', () => {
    const row = describeRecentBooking(booking({ customer_name: '  ', service_name_snapshot: '', booking_time: '' }), now);
    expect(row.service).toBe('Booking');
    expect(row.detail).toBe('Client · for Tue 10 Nov');
  });

  it('labels a cancelled booking as cancelled', () => {
    expect(describeRecentBooking(booking({ status: 'cancelled' }), now).status).toBe('Cancelled');
  });
});
