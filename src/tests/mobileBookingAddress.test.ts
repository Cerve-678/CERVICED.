import { isMobileBooking, hasMapDestination } from '../types/booking';

const COORDS = { latitude: 51.5, longitude: -0.1 } as never;

describe('who travels to whom', () => {
  it('reads the provider business type, not the presence of a client address', () => {
    // A salon booking that carries a client address (every booking made by a
    // client with a saved default address did, before the checkout fix) is
    // still a salon booking — the venue is the salon.
    expect(
      isMobileBooking({ providerBusinessType: 'studio', clientAddress: '98 Hainault Road' }),
    ).toBe(false);
    // A mobile booking is mobile before the client has sent an address.
    expect(isMobileBooking({ providerBusinessType: 'mobile', clientAddress: null })).toBe(true);
  });

  it('falls back to the client address only when the business type is unknown', () => {
    expect(isMobileBooking({ clientAddress: '98 Hainault Road' })).toBe(true);
    expect(isMobileBooking({ clientAddress: '   ' })).toBe(false);
    expect(isMobileBooking({})).toBe(false);
  });

  it('never points Directions at a mobile provider', () => {
    // Legacy mobile bookings still carry the provider's own base coordinates,
    // snapshotted before checkout stopped doing it. They are not a destination
    // for the client — the provider is coming to them.
    expect(
      hasMapDestination({
        address: 'East London',
        coordinates: COORDS,
        providerBusinessType: 'mobile',
      }),
    ).toBe(false);
    expect(
      hasMapDestination({
        address: 'Wellspring House, 11 Seagull Lane',
        coordinates: COORDS,
        providerBusinessType: 'studio',
      }),
    ).toBe(true);
  });

  it('still refuses a non-mobile booking with no released address', () => {
    expect(
      hasMapDestination({
        address: 'Address will be confirmed by provider',
        coordinates: COORDS,
        providerBusinessType: 'studio',
      }),
    ).toBe(false);
    expect(
      hasMapDestination({ address: 'Real Street', coordinates: null, providerBusinessType: 'salon' }),
    ).toBe(false);
  });
});
