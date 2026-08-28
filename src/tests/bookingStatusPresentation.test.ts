import { BookingStatus } from '../contexts/BookingContext';
import { BOOKING_STATUS_COLORS, BOOKING_STATUS_LABELS, PROVIDER_BOOKING_DB_STATUS } from '../features/bookings/statusPresentation';

describe('booking status presentation', () => {
  it('keeps provider status mutations aligned with visible booking status', () => {
    expect(BOOKING_STATUS_LABELS[BookingStatus.UPCOMING]).toBe('Upcoming');
    expect(BOOKING_STATUS_COLORS[BookingStatus.CANCELLED]).toBe('#FF3B30');
    expect(PROVIDER_BOOKING_DB_STATUS[BookingStatus.UPCOMING]).toBe('confirmed');
    expect(PROVIDER_BOOKING_DB_STATUS[BookingStatus.NO_SHOW]).toBe('no_show');
  });
});
