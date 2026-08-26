import {
  resolveSlotOffer,
  describeEmergencyReason,
  toWindowMins,
  type EmergencyReason,
} from '../services/AvailabilityService';

// There is deliberately NO bound on which hours an emergency request may
// reach — the provider's working hours decide what is ordinarily bookable,
// everything else is requestable once they opt in, and they answer each one.
// An earlier version bounded requests to the provider's weekly envelope
// widened by a fixed extension, which banned a 4am bridal call: the single
// most common genuine out-of-hours booking in this industry, refused because
// the bound was inferred from hours describing a NORMAL week.
//
// What survives every opt-in is the pair of time-relative rules below. They
// mirror enforce_booking_bookability() exactly — if they drift, the picker
// offers times the database then rejects.
describe('resolveSlotOffer', () => {
  const NOW = new Date('2026-08-26T15:00:00').getTime();
  const at = (iso: string) => new Date(iso).getTime();

  it('never offers a start that has already passed, opt-in or not', () => {
    // Short notice allowed, no other restriction — still refused, because the
    // trigger rejects an elapsed same-day time unconditionally.
    expect(resolveSlotOffer([], at('2026-08-26T14:00:00'), NOW, NOW, true)).toBeNull();
    expect(resolveSlotOffer(['outside_hours'], at('2026-08-26T09:00:00'), NOW, NOW, true)).toBeNull();
  });

  it('offers a start past the notice window with exactly the reasons it came in with', () => {
    const earliest = at('2026-08-26T19:00:00'); // 4h minimum notice
    expect(resolveSlotOffer([], at('2026-08-26T20:00:00'), NOW, earliest, false)).toEqual([]);
    expect(resolveSlotOffer(['outside_hours'], at('2026-08-26T22:00:00'), NOW, earliest, false))
      .toEqual(['outside_hours']);
  });

  it('refuses a start inside the notice window unless short notice is allowed', () => {
    const earliest = at('2026-08-26T19:00:00');
    const soon = at('2026-08-26T17:00:00'); // future, but inside the notice window
    expect(resolveSlotOffer([], soon, NOW, earliest, false)).toBeNull();
    expect(resolveSlotOffer([], soon, NOW, earliest, true)).toEqual(['short_notice']);
  });

  it('accumulates short notice on top of the reasons the date already carried', () => {
    // A blocked date, beyond the booking window, at short notice — every one
    // of those needs its own opt-in, and the confirmation names all three.
    const earliest = at('2026-08-26T19:00:00');
    expect(resolveSlotOffer(
      ['blocked_date', 'beyond_window'], at('2026-08-26T17:00:00'), NOW, earliest, true,
    )).toEqual(['blocked_date', 'beyond_window', 'short_notice']);
  });

  it('treats a start exactly on the notice boundary as meeting it', () => {
    const earliest = at('2026-08-26T19:00:00');
    // Not short notice — so it must NOT pick up the reason, and must not
    // depend on the short-notice opt-in to be offered at all.
    expect(resolveSlotOffer([], earliest, NOW, earliest, false)).toEqual([]);
  });

  it('offers a 4am start like any other, when the day is open to requests', () => {
    // The case the removed envelope bound used to refuse outright.
    const fourAm = at('2026-08-27T04:00:00');
    expect(resolveSlotOffer(['outside_hours'], fourAm, NOW, NOW, false))
      .toEqual(['outside_hours']);
  });
});

describe('describeEmergencyReason', () => {
  it('names the provider in every reason', () => {
    const reasons: EmergencyReason[] = ['outside_hours', 'blocked_date', 'short_notice', 'beyond_window'];
    for (const reason of reasons) {
      expect(describeEmergencyReason(reason, 'Ana')).toContain('Ana');
    }
  });

  it('reads as a clause the confirmation can drop into a sentence', () => {
    expect(describeEmergencyReason('outside_hours', 'Ana')).toBe("outside Ana's working hours");
    expect(describeEmergencyReason('blocked_date', 'Ana')).toBe('on a date Ana has marked unavailable');
  });
});

// The provider STATES how far either side of their hours they'll be asked.
// null is "any time" and is the default — the distinction that matters is
// that a missing/unreadable value must never collapse to 0, which would
// silently switch out-of-hours requests off for that provider entirely.
describe('toWindowMins', () => {
  it('treats null, undefined and a missing column alike as "any time"', () => {
    expect(toWindowMins(null)).toBeNull();
    expect(toWindowMins(undefined)).toBeNull();
    expect(toWindowMins(({} as Record<string, unknown>)['request_window_before_mins'])).toBeNull();
  });

  it('keeps a real bound, including an explicit zero', () => {
    // 0 is a genuine answer — "not a minute past my closing time" — and is
    // NOT the same as "any time".
    expect(toWindowMins(0)).toBe(0);
    expect(toWindowMins(120)).toBe(120);
    expect(toWindowMins('240')).toBe(240);
  });

  it('falls back to "any time" rather than 0 on an unusable value', () => {
    expect(toWindowMins('not a number')).toBeNull();
    expect(toWindowMins(-30)).toBeNull();
    expect(toWindowMins(NaN)).toBeNull();
  });
});
