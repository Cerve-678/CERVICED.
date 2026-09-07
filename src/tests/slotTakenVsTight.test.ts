import { isStartTaken } from '../services/AvailabilityService';

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
