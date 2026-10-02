import { buildDaySummary, greetingFor, type DaySummaryBooking } from '../utils/daySummary';

const booking = (over: Partial<DaySummaryBooking>): DaySummaryBooking => ({
  id: 'b1',
  booking_date: '2026-10-02',
  booking_time: '10:00:00',
  end_time: '11:00:00',
  status: 'confirmed',
  customer_name: 'Ama',
  service_name_snapshot: 'Silk press',
  ...over,
});

describe('day summary', () => {
  it("lists only the day's real appointments, in time order", () => {
    const s = buildDaySummary({
      date: '2026-10-02',
      bookings: [
        booking({ id: 'late', booking_time: '15:00:00' }),
        booking({ id: 'early', booking_time: '09:00:00', status: 'pending' }),
        booking({ id: 'done', booking_time: '12:00:00', status: 'completed' }),
        booking({ id: 'cancelled', status: 'cancelled' }),
        booking({ id: 'noshow', status: 'no_show' }),
        booking({ id: 'tomorrow', booking_date: '2026-10-03' }),
      ],
      rescheduleRequests: [],
      unreadMessages: 0,
      waitingOnWaitlist: 0,
    });
    expect(s.appointments.map(b => b.id)).toEqual(['early', 'done', 'late']);
  });

  it('counts to-dos the same way the To Do tab does', () => {
    const s = buildDaySummary({
      date: '2026-10-02',
      bookings: [
        booking({ id: 'p1', status: 'pending' }),
        booking({ id: 'p2', status: 'pending', booking_date: '2026-10-09' }),
        booking({ id: 'c1' }),
      ],
      // Only 'pending' is waiting on the provider; 'provider_responded' is on the client.
      rescheduleRequests: [
        { booking_id: 'c1', status: 'pending' },
        { booking_id: 'p2', status: 'provider_responded' },
      ],
      unreadMessages: 3,
      waitingOnWaitlist: 1,
    });
    expect(s.todo).toEqual({ bookingRequests: 2, rescheduleRequests: 1, unreadMessages: 3, waitlist: 1 });
    expect(s.todoTotal).toBe(7);
  });

  it('greets by time of day', () => {
    expect(greetingFor(new Date(2026, 9, 2, 7))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 9, 2, 13))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 9, 2, 19))).toBe('Good evening');
  });
});
