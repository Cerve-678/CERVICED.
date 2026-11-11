import { BookingStatus } from '../contexts/BookingContext';
import { mapDbBookingToConfirmed } from '../services/bookingService';
import type { BookingWithAddOns } from '../types/database';
import {
  BOOKING_STATUS_COLORS,
  BOOKING_STATUS_LABELS,
  PROVIDER_BOOKING_DB_STATUS,
  isDeclinedRequest,
} from '../features/bookings/statusPresentation';

describe('booking status presentation', () => {
  it('keeps provider status mutations aligned with visible booking status', () => {
    expect(BOOKING_STATUS_LABELS[BookingStatus.UPCOMING]).toBe('Upcoming');
    expect(BOOKING_STATUS_COLORS[BookingStatus.CANCELLED]).toBe('#FF3B30');
    expect(PROVIDER_BOOKING_DB_STATUS[BookingStatus.UPCOMING]).toBe('confirmed');
    expect(PROVIDER_BOOKING_DB_STATUS[BookingStatus.NO_SHOW]).toBe('no_show');
  });
});

describe('a declined request', () => {
  it('reads as declined only when the DB stamped declined_at on a cancelled booking', () => {
    expect(isDeclinedRequest({ status: BookingStatus.CANCELLED, declinedAt: '2026-11-10T10:00:00Z' })).toBe(true);
    // Cancelled after it was accepted, or withdrawn by the client: still "Cancelled".
    expect(isDeclinedRequest({ status: BookingStatus.CANCELLED, declinedAt: undefined })).toBe(false);
    expect(isDeclinedRequest({ status: BookingStatus.PENDING, declinedAt: undefined })).toBe(false);
  });

  it('carries declined_at from the client_bookings row into the app', () => {
    const booking = mapDbBookingToConfirmed({
      id: 'b1',
      status: 'cancelled',
      cancelled_by: 'provider',
      declined_at: '2026-11-10T10:00:00Z',
      booking_date: '2026-11-12',
      booking_time: '10:00:00',
      provider_name_snapshot: 'Lola Studio',
      service_name_snapshot: 'Gel Manicure',
      base_price: 30,
    } as unknown as BookingWithAddOns);
    expect(booking.declinedAt).toBe('2026-11-10T10:00:00Z');
    expect(isDeclinedRequest(booking)).toBe(true);
  });
});
