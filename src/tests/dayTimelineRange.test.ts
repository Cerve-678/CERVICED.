import { describe, expect, it } from '@jest/globals';
import { resolveTimelineRange } from '../utils/dayTimelineRange';

const hours = (openH: number, closeH: number, openM = 0, closeM = 0) => ({
  openMins: openH * 60 + openM,
  closeMins: closeH * 60 + closeM,
});

const span = (startH: number, durationMins: number, startM = 0) => ({
  startMins: startH * 60 + startM,
  durationMins,
});

describe('resolveTimelineRange', () => {
  it('keeps 7am–9pm for an ordinary day', () => {
    expect(resolveTimelineRange(hours(9, 18), [])).toEqual({ startHour: 7, endHour: 21 });
  });

  it('opens earlier when the provider does', () => {
    expect(resolveTimelineRange(hours(3, 18), []).startHour).toBe(3);
  });

  it('runs later when the provider closes after 9pm', () => {
    expect(resolveTimelineRange(hours(9, 22, 0, 30), []).endHour).toBe(23);
  });

  it('includes bookings outside working hours', () => {
    expect(resolveTimelineRange(hours(9, 18), [span(0, 120, 30)]).startHour).toBe(0);
  });

  it('rounds a partial ending hour outwards', () => {
    expect(resolveTimelineRange(null, [span(20, 90, 45)]).endHour).toBe(23);
  });

  it('uses the default range on a closed, empty day', () => {
    expect(resolveTimelineRange(null, [])).toEqual({ startHour: 7, endHour: 21 });
  });

  it('never runs outside the day', () => {
    const range = resolveTimelineRange(hours(0, 23, 0, 59), [span(23, 120)]);
    expect(range).toEqual({ startHour: 0, endHour: 24 });
  });
});
