import { dayBadgeFrom, dayDataFrom, type TimeSlot } from '../components/ModernBeautyCalendar';

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

// The badge speaks for EVERY time rendered under it, so each branch has to be
// true of all of them. The old shape picked a winner instead: any single past
// time beat both of the others outright.
describe('dayBadgeFrom', () => {
  const tight = (time: string): TimeSlot => ({ time, reasons: [], blocked: 'tight' });

  it('says nothing while anything is still bookable', () => {
    expect(dayBadgeFrom([open('9:00 AM'), blocked('10:00 AM', 'past')], 'Amy')).toBeNull();
    expect(dayBadgeFrom([], 'Amy')).toBeNull();
  });

  it('names the reason when the whole grid shares one', () => {
    expect(dayBadgeFrom([blocked('9:00 AM', 'past'), blocked('10:00 AM', 'past')], 'Amy'))
      .toBe('These times have passed');
    expect(dayBadgeFrom([blocked('9:00 AM', 'notice'), blocked('10:00 AM', 'notice')], 'Amy'))
      .toBe('Too soon — Amy needs more notice');
    expect(dayBadgeFrom([blocked('9:00 AM', 'booked'), tight('10:00 AM')], 'Amy'))
      .toBe('Fully booked');
  });

  // The reported bug, and it hit every live provider daily: they all run a
  // 2-hour minimum notice, so for the last two hours of every working day the
  // grid is this exact mix — a morning that has genuinely gone, and a late
  // slot greyed only because it's too soon. Saying "these times have passed"
  // over a 4:00 PM at 3:30pm is a claim the client can disprove by looking at
  // their clock.
  it('never lets an expired morning speak for a time that has not passed', () => {
    const badge = dayBadgeFrom(
      [
        blocked('9:00 AM', 'past'), blocked('10:00 AM', 'past'), blocked('11:00 AM', 'past'),
        blocked('12:00 PM', 'past'), blocked('1:00 PM', 'past'), blocked('2:00 PM', 'past'),
        blocked('3:00 PM', 'past'),
        blocked('4:00 PM', 'notice'),
      ],
      'Amy',
    );
    expect(badge).not.toBe('These times have passed');
    expect(badge).toBe('Nothing left today');
  });

  // Same shape the other way round: one expired time used to hide a day that
  // other clients had genuinely taken.
  it('does not let one expired time relabel a booked-out day', () => {
    expect(
      dayBadgeFrom(
        [blocked('9:00 AM', 'past'), blocked('10:00 AM', 'booked'), blocked('11:00 AM', 'booked')],
        'Amy',
      ),
    ).toBe('Nothing left today');
  });

  // 'Fully booked' is the narrowest claim of the three — it blames other
  // clients and sends this one to a waitlist — so a mixed day must not make
  // it, in either direction.
  it('claims "Fully booked" only when clients really took the whole day', () => {
    expect(dayBadgeFrom([blocked('9:00 AM', 'booked'), blocked('4:00 PM', 'notice')], 'Amy'))
      .toBe('Nothing left on this day');
  });
});
