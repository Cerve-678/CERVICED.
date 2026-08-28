import { formatBookingRef } from '../features/bookings/presentation';

// A booking reference gets read aloud between a client and a provider, so two
// things have to hold: both hats derive the same string from the same
// booking, and the string is genuinely unique rather than a truncation that
// merely looks unique. ProviderHomeScreen used to show 10 characters while
// every other surface showed 8, and none of them were unique at all.
describe('formatBookingRef', () => {
  const id = '34e82c04-e0db-47ba-81c1-63f420c27d4a';

  it('prefers the stored unique code and prefixes it for display', () => {
    expect(formatBookingRef({ bookingRef: '4B2X9K7M', id })).toBe('CRV-4B2X9K7M');
  });

  it('uppercases a stored code so it reads the same however it was written', () => {
    expect(formatBookingRef({ bookingRef: '4b2x9k7m', id })).toBe('CRV-4B2X9K7M');
  });

  it('falls back to the old truncation for rows predating the ref column', () => {
    // A client holding a receipt printed before the migration must still be
    // able to find their booking, so the legacy form has to keep resolving.
    expect(formatBookingRef({ id })).toBe('34E82C04');
    expect(formatBookingRef({ bookingRef: null, id })).toBe('34E82C04');
    expect(formatBookingRef({ bookingRef: '   ', id })).toBe('34E82C04');
  });

  it('survives a missing booking rather than throwing mid-render', () => {
    expect(formatBookingRef(null)).toBe('');
    expect(formatBookingRef(undefined)).toBe('');
    expect(formatBookingRef({})).toBe('');
  });

  it('does not reintroduce the 10-character provider-side variant', () => {
    expect(formatBookingRef({ id })).toHaveLength(8);
  });
});
