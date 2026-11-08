import { mapDbBookingToConfirmed } from '../services/bookingService';
import type { BookingWithAddOns } from '../types/database';

// How to get there is part of the provider's private venue. Clients get it
// from the client_bookings view, null until the address is released;
// providers get their own from a booking_venue_details embed (migration
// 20261108100000). The app's only job is to carry it through untouched —
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

describe('mapDbBookingToConfirmed — where the venue comes from', () => {
  const bare = (overrides: Partial<BookingWithAddOns> = {}) => {
    const row = makeRow(overrides);
    delete row.provider_address_snapshot;
    delete row.provider_directions_snapshot;
    return row;
  };

  it("reads a provider's own venue from the booking_venue_details embed", () => {
    const booking = mapDbBookingToConfirmed(bare({
      booking_venue_details: {
        address: '12 Mare Street, London E8',
        directions: 'Buzzer 3B',
        coordinates: { lat: 51.54, lng: -0.06 },
      },
    }));
    expect(booking.address).toBe('12 Mare Street, London E8');
    expect(booking.howToGetThere).toBe('Buzzer 3B');
    expect(booking.coordinates).toEqual({ latitude: 51.54, longitude: -0.06 });
  });

  it('reads the embed when PostgREST returns it as a one-item array', () => {
    const booking = mapDbBookingToConfirmed(bare({
      booking_venue_details: [{ address: '1 High St', directions: null, coordinates: null }],
    }));
    expect(booking.address).toBe('1 High St');
  });

  it('has no venue at all on a plain bookings row, which no longer carries one', () => {
    const booking = mapDbBookingToConfirmed(bare());
    expect(booking.address).toBe('');
    expect(booking.howToGetThere).toBeUndefined();
    expect(booking.coordinates).toBeNull();
  });
});
