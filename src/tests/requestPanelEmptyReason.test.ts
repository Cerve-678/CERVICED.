import { resolveRequestEmptyReason, type RequestSlotShape } from '../components/RequestTimePanel';

// The request sheet used to answer every empty day with one sentence —
// "{provider} isn't taking requests on this date" — which is a claim about the
// provider's policy. It was false for the commonest case of all: today, late
// in the day, with the requestable times simply gone. getAvailableSlots strips
// requestReasons off a start that has passed, so by the time the list reached
// the panel a run-down day looked identical to a day taking no requests.
//
// These pin the ORDER the reasons are tested in, which is the entire content
// of the function — every branch returns a plausible sentence, so a wrong
// order is invisible without a test.
describe('resolveRequestEmptyReason', () => {
  const slot = (over: Partial<RequestSlotShape> = {}): RequestSlotShape => ({
    reasons: [],
    ...over,
  });

  it('says nothing at all while a time can still be offered', () => {
    expect(resolveRequestEmptyReason([
      slot({ reasons: ['outside_hours'] }),
      slot({ blocked: 'past' }),
    ])).toBeUndefined();
  });

  it('blames the clock, not the provider, once the day has run down', () => {
    // The regression this exists for: every start gone, every reason stripped
    // with them, so the day arrives looking like one with no request policy.
    expect(resolveRequestEmptyReason([
      slot({ blocked: 'past' }),
      slot({ blocked: 'past' }),
    ])).toBe('past');
  });

  it('still blames the clock when passed starts sit alongside booked ones', () => {
    // 'past' outranks 'booked' because a start that has gone took its reasons
    // with it — we can no longer tell it was requestable, and "already gone"
    // is true regardless of what it once was.
    expect(resolveRequestEmptyReason([
      slot({ blocked: 'past' }),
      slot({ reasons: ['outside_hours'], blocked: 'booked' }),
    ])).toBe('past');
  });

  it('says someone took them only when a requestable start was actually booked', () => {
    expect(resolveRequestEmptyReason([
      slot({ reasons: ['outside_hours'], blocked: 'booked' }),
      slot({ blocked: 'tight' }),
    ])).toBe('booked');
  });

  it('does not claim a booking when the only blocked starts are too soon', () => {
    expect(resolveRequestEmptyReason([
      slot({ blocked: 'notice' }),
      slot({ blocked: 'notice' }),
    ])).toBe('notice');
  });

  // The one branch that blames the provider — reached only with proof, the
  // same bar the calendar's badge holds itself to before saying "Fully booked".
  it('blames the provider only once nothing else explains the empty day', () => {
    expect(resolveRequestEmptyReason([
      slot({ reasons: [] }),
      slot({ reasons: [] }),
    ])).toBe('none');
    expect(resolveRequestEmptyReason([])).toBe('none');
  });
});
