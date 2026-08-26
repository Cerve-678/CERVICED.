import {
  BookingStatus,
  TERMINAL_BOOKING_STATUSES,
  isTerminalBookingStatus,
  pendingRescheduleStatusOverride,
} from '../types/booking';

describe('terminal booking statuses', () => {
  it('covers every status a booking never leaves', () => {
    expect([...TERMINAL_BOOKING_STATUSES].sort()).toEqual(
      [
        BookingStatus.CANCELLED,
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
        BookingStatus.PROVIDER_NO_SHOW,
      ].sort(),
    );
  });

  it('does not treat a live status as terminal', () => {
    expect(isTerminalBookingStatus(BookingStatus.PENDING)).toBe(false);
    expect(isTerminalBookingStatus(BookingStatus.UPCOMING)).toBe(false);
    expect(isTerminalBookingStatus(BookingStatus.IN_PROGRESS)).toBe(false);
  });
});

describe('pendingRescheduleStatusOverride', () => {
  it('holds an open reschedule at UPCOMING so the old date cannot age it out', () => {
    expect(
      pendingRescheduleStatusOverride({
        status: BookingStatus.UPCOMING,
        isPendingReschedule: true,
      }),
    ).toBe(BookingStatus.UPCOMING);

    expect(
      pendingRescheduleStatusOverride({
        status: BookingStatus.PENDING,
        isPendingReschedule: true,
      }),
    ).toBe(BookingStatus.UPCOMING);
  });

  it('never overrides a terminal status', () => {
    // The regression: request a1b9c766 sat 'pending' on a booking that had
    // already completed, so the override resurrected it to UPCOMING — and
    // because BookingsScreen also filters pending-reschedule bookings out of
    // Past, it could never leave the client's Upcoming tab.
    for (const status of TERMINAL_BOOKING_STATUSES) {
      expect(
        pendingRescheduleStatusOverride({ status, isPendingReschedule: true }),
      ).toBeNull();
    }
  });

  it('falls through when no reschedule is open', () => {
    expect(
      pendingRescheduleStatusOverride({ status: BookingStatus.UPCOMING }),
    ).toBeNull();
    expect(
      pendingRescheduleStatusOverride({
        status: BookingStatus.UPCOMING,
        isPendingReschedule: false,
      }),
    ).toBeNull();
  });
});
