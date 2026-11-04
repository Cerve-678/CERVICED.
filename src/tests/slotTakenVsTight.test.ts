import { isStartTaken, showEachBookingOnce } from '../services/AvailabilityService';

const span = (startH: number, endH: number, startM = 0, endM = 0) =>
  ({ start: startH * 60 + startM, end: endH * 60 + endM });

const at = (h: number, m = 0) => h * 60 + m;

/**
 * The picker crosses out taken times, and a strike-through is a claim that
 * ANOTHER CLIENT has that time. It used to be set for any slot that merely
 * overlapped a busy span, so a time the provider was simply too tightly
 * booked to fit the service into was presented as one somebody had taken —
 * a different, and false, statement about the provider's day.
 */
describe('isStartTaken', () => {
  it('is true for a start inside someone else’s appointment', () => {
    expect(isStartTaken([span(15, 16, 0, 50)], at(15))).toBe(true);
    expect(isStartTaken([span(15, 16, 0, 50)], at(15, 30))).toBe(true);
  });

  it('is false for a start that only runs INTO an appointment', () => {
    // 14:30 is free; a 60-minute service just can't finish before 15:00.
    // Greyed out, yes — crossed out, no.
    expect(isStartTaken([span(15, 16, 0, 50)], at(14, 30))).toBe(false);
  });

  it('is false for the moment an appointment ends', () => {
    // Back-to-back is bookable, so the end of a span must not read as taken.
    expect(isStartTaken([span(15, 16)], at(16))).toBe(false);
  });

  it('counts a start inside a booking’s buffer as taken', () => {
    // Spans arrive already padded with each booking's own buffers — the
    // provider really is occupied during the cleanup gap.
    expect(isStartTaken([span(18, 20, 45, 15)], at(19))).toBe(true);
    expect(isStartTaken([span(18, 20, 45, 15)], at(18, 45))).toBe(true);
  });

  it('is false on a day with nothing booked', () => {
    expect(isStartTaken([], at(11))).toBe(false);
  });

  it('checks every span, not just the first that clashes', () => {
    const day = [span(10, 11), span(15, 16, 0, 50)];
    expect(isStartTaken(day, at(15, 30))).toBe(true);
    expect(isStartTaken(day, at(12))).toBe(false);
  });
});

describe('showEachBookingOnce', () => {
  const grid = (times: number[], spans: { start: number; end: number }[]) =>
    times.map(startMins => ({ startMins, taken: isStartTaken(spans, startMins) }));

  it('shows a 2-hour booking as one taken time, not four', () => {
    const spans = [span(15, 17)];
    const day = grid([at(14, 30), at(15), at(15, 30), at(16), at(16, 30), at(17)], spans);
    expect(showEachBookingOnce(spans, day).map(s => s.startMins))
      .toEqual([at(14, 30), at(15), at(17)]);
  });

  it('keeps the first grid time inside a booking that starts off the grid', () => {
    const spans = [span(15, 17, 15, 15)];
    const day = grid([at(15), at(15, 30), at(16), at(16, 30), at(17), at(17, 30)], spans);
    expect(showEachBookingOnce(spans, day).map(s => s.startMins))
      .toEqual([at(15), at(15, 30), at(17, 30)]);
  });

  it('shows two back-to-back bookings once each', () => {
    const spans = [span(10, 11), span(11, 13)];
    const day = grid([at(10), at(10, 30), at(11), at(11, 30), at(12), at(13)], spans);
    expect(showEachBookingOnce(spans, day).map(s => s.startMins))
      .toEqual([at(10), at(11), at(13)]);
  });

  it('leaves a day with nothing booked alone', () => {
    const day = grid([at(9), at(10)], []);
    expect(showEachBookingOnce([], day)).toEqual(day);
  });
});
