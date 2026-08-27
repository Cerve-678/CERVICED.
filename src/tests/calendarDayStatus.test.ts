import { dayDataFrom, type TimeSlot } from '../components/ModernBeautyCalendar';

const open = (time: string): TimeSlot => ({ time, reasons: [] });
const blocked = (time: string, why: 'booked' | 'past' | 'notice'): TimeSlot =>
  ({ time, reasons: [], blocked: why });
const request = (time: string): TimeSlot => ({ time, reasons: ['outside_hours'] });

// A day's status drives three things at once: whether its pill is tappable,
// what dot it gets, and whether the auto-jump lands on it. Blocked times are
// kept in `times` so the grid can show the day's shape greyed out — but they
// are NOT on offer, and counting them would put an availability dot on a day
// with nothing left.
describe('dayDataFrom', () => {
  it('counts only times that can actually be taken', () => {
    const day = dayDataFrom([open('9:00 AM'), blocked('9:30 AM', 'booked'), open('10:00 AM')]);
    expect(day.available).toBe(2);
    expect(day.status).toBe('available');
    // The blocked one is still there to render.
    expect(day.times).toHaveLength(3);
  });

  it('does not let a blocked time make a dead day look available', () => {
    const day = dayDataFrom([blocked('9:00 AM', 'booked'), blocked('9:30 AM', 'booked')], true);
    expect(day.available).toBe(0);
    expect(day.status).toBe('full');
  });

  // 'closed' is what makes a day pill untappable, so a day that HAS something
  // to show must never land there — the greyed grid and its badge are the
  // only things that explain why the day is unreachable.
  it("marks a day whose times have all passed 'over', not 'closed'", () => {
    const day = dayDataFrom([blocked('9:00 AM', 'past'), blocked('9:30 AM', 'past')]);
    expect(day.status).toBe('over');
  });

  it("marks a day blocked by the provider's notice window 'over' too", () => {
    const day = dayDataFrom([blocked('9:00 AM', 'notice'), blocked('9:30 AM', 'notice')]);
    expect(day.status).toBe('over');
  });

  it("keeps 'closed' for a day the provider genuinely never works", () => {
    expect(dayDataFrom([]).status).toBe('closed');
  });

  // Booked-out and over want opposite responses from a client (wait for this
  // provider vs. just pick another day), so they can't collapse together.
  it('separates a booked-out day from one that is merely over', () => {
    expect(dayDataFrom([blocked('9:00 AM', 'booked')], true).status).toBe('full');
    expect(dayDataFrom([blocked('9:00 AM', 'past')], false).status).toBe('over');
  });

  it('reports a request-only day as requestable, not available', () => {
    const day = dayDataFrom([request('4:00 AM'), blocked('9:00 AM', 'booked')]);
    expect(day.available).toBe(0);
    expect(day.requestable).toBe(1);
    expect(day.status).toBe('request');
  });

  it('does not count a blocked by-request time as requestable', () => {
    const day = dayDataFrom([{ time: '4:00 AM', reasons: ['outside_hours'], blocked: 'past' }]);
    expect(day.requestable).toBe(0);
    expect(day.status).toBe('over');
  });
});

// "Fully booked" is a claim about other clients having taken the day. A day
// that emptied out because some times were booked and the rest simply expired
// is not booked out — saying so blames other clients for hours nobody wanted,
// and sends this one to a waitlist that can't help.
describe('day status vs. why the day emptied', () => {
  it('is full only when every time was actually taken', () => {
    const allTaken = dayDataFrom(
      [blocked('9:00 AM', 'booked'), blocked('9:30 AM', 'booked')], true,
    );
    expect(allTaken.status).toBe('full');
  });

  it('is not full when some of the day merely expired', () => {
    // Two taken, one that nobody booked and which has now passed.
    const mixed = dayDataFrom(
      [blocked('9:00 AM', 'booked'), blocked('9:30 AM', 'booked'), blocked('10:00 AM', 'past')],
      false,
    );
    expect(mixed.status).toBe('over');
    expect(mixed.available).toBe(0);
  });

  it('still has something to render in every emptied case', () => {
    // The grid is what shows the day's shape, so it must never come back
    // empty just because nothing on it can be booked.
    for (const why of ['booked', 'past', 'notice'] as const) {
      expect(dayDataFrom([blocked('9:00 AM', why)]).times).toHaveLength(1);
    }
  });
});
