import { mapDbBookingToConfirmed } from '../services/bookingService';
import type { BookingWithAddOns } from '../types/database';

// How to get there is snapshotted onto the booking and nulled by the
// client_bookings view until the address is released (migration
// 20261101115322). The app's only job is to carry it through untouched —
// and to show nothing at all when the view has withheld it.

function makeRow(overrides: Partial<BookingWithAddOns> = {}): BookingWithAddOns {
  return {
    id: 'b-1',
    status: 'confirmed',
    booking_date: '2026-11-10',
    booking_time: '10:00:00',
    end_time: '11:00:00',
    base_price: 40,
    provider_name_snapshot: 'Ava Studio',
    service_name_snapshot: 'Silk press',
    provider_address_snapshot: '12 Mare Street, London E8',
    provider_directions_snapshot: 'Buzzer 3B, side entrance',
    add_ons: [],
    ...overrides,
  } as unknown as BookingWithAddOns;
}

describe('mapDbBookingToConfirmed — how to get there', () => {
  it('carries the released directions onto the booking', () => {
    expect(mapDbBookingToConfirmed(makeRow()).howToGetThere).toBe('Buzzer 3B, side entrance');
  });

  it('leaves them out while the view is still withholding the address', () => {
    const booking = mapDbBookingToConfirmed(
      makeRow({ provider_address_snapshot: null, provider_directions_snapshot: null }),
    );
    expect(booking.howToGetThere).toBeUndefined();
  });

  it('leaves them out for a booking made before the provider added any', () => {
    const row = makeRow();
    delete row.provider_directions_snapshot;
    expect(mapDbBookingToConfirmed(row).howToGetThere).toBeUndefined();
  });
});
