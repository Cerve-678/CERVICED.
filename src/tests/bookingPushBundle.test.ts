import {
  BUNDLE_WINDOW_MINUTES,
  buzzedEarlier,
  isBundleCandidate,
} from '../../supabase/functions/_shared/bookingPushBundle';

// Booking a service writes booking confirmed, payment received, address and
// info pack within seconds of each other. The phone should buzz once.
const T = Date.parse('2026-11-24T12:00:00.000Z');
const at = (secondsFromT: number) => new Date(T + secondsFromT * 1000).toISOString();
const allowAll = () => true;

describe('which notifications share a booking buzz', () => {
  it('covers the client booking-time alerts that name a booking', () => {
    for (const type of [
      'booking_pending',
      'booking_confirmed',
      'payment_success',
      'address_released',
      'info_pack_received',
      'intake_form_received',
    ]) {
      expect(isBundleCandidate({ type, recipient_role: 'client', booking_id: 'b1' })).toBe(true);
    }
  });

  it('leaves provider alerts, other types and alerts with no booking alone', () => {
    expect(isBundleCandidate({ type: 'booking_confirmed', recipient_role: 'provider', booking_id: 'b1' })).toBe(false);
    expect(isBundleCandidate({ type: 'booking_cancelled', recipient_role: 'client', booking_id: 'b1' })).toBe(false);
    expect(isBundleCandidate({ type: 'payment_success', recipient_role: 'client', booking_id: null })).toBe(false);
  });
});

describe('buzzedEarlier', () => {
  const me = { id: 'n-b', claimedAt: at(5) };

  it('goes quiet when another alert for the booking already buzzed', () => {
    expect(buzzedEarlier(me, [{ id: 'n-a', type: 'booking_confirmed', claimedAt: at(0) }], allowAll)).toBe(true);
  });

  it('still buzzes when the other one came after it', () => {
    expect(buzzedEarlier(me, [{ id: 'n-c', type: 'payment_success', claimedAt: at(6) }], allowAll)).toBe(false);
  });

  it('lets exactly one of two same-instant alerts buzz', () => {
    const a = { id: 'n-a', type: 'booking_confirmed', claimedAt: at(5) };
    const b = { id: 'n-b', type: 'payment_success', claimedAt: at(5) };
    expect(buzzedEarlier({ id: a.id, claimedAt: a.claimedAt }, [b], allowAll)).toBe(false);
    expect(buzzedEarlier({ id: b.id, claimedAt: b.claimedAt }, [a], allowAll)).toBe(true);
  });

  it("isn't silenced by an alert the person switched off, which never buzzed", () => {
    const muted = (type: string) => type !== 'booking_confirmed';
    expect(buzzedEarlier(me, [{ id: 'n-a', type: 'booking_confirmed', claimedAt: at(0) }], muted)).toBe(false);
  });

  it(`buzzes again once ${BUNDLE_WINDOW_MINUTES} minutes have passed`, () => {
    const old = { id: 'n-a', type: 'booking_confirmed', claimedAt: at(-BUNDLE_WINDOW_MINUTES * 60 - 1) };
    expect(buzzedEarlier(me, [old], allowAll)).toBe(false);
  });

  it('ignores itself and unreadable times', () => {
    expect(buzzedEarlier(me, [{ id: 'n-b', type: 'booking_confirmed', claimedAt: at(0) }], allowAll)).toBe(false);
    expect(buzzedEarlier(me, [{ id: 'n-a', type: 'booking_confirmed', claimedAt: 'junk' }], allowAll)).toBe(false);
  });
});
