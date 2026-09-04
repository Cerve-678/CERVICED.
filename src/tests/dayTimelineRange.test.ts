import { resolveTimelineRange } from '../utils/dayTimelineRange';

const hours = (openH: number, closeH: number, openM = 0, closeM = 0) =>
  ({ openMins: openH * 60 + openM, closeMins: closeH * 60 + closeM });

const span = (startH: number, durationMins: number, startM = 0) =>
  ({ startMins: startH * 60 + startM, durationMins });

/**
 * ProviderHomeScreen's day timeline used to be fixed at 7am–9pm. A provider
 * whose day starts earlier lost the top of it: the hour labels stopped at 7am
 * and every earlier booking was clamped to `top: 0`, so a 3am appointment was
 * drawn against the 7am line and read as a 7am one rather than as something
 * off the top of the grid.
 */
describe('resolveTimelineRange', () => {
  it('keeps the familiar 7am–9pm shape for an ordinary day', () => {
    expect(resolveTimelineRange(hours(9, 18), [])).toEqual({ startHour: 7, endHour: 21 });
  });

  it('opens earlier when the provider does', () => {
    // A provider really does open at 03:00 on their Mondays.
    expect(resolveTimelineRange(hours(3, 18), []).startHour).toBe(3);
  });

  it('runs later when the provider closes after 9pm', () => {
    expect(resolveTimelineRange(hours(9, 22, 0, 30), []).endHour).toBe(23);
  });

  it('stretches to hold a booking outside the working hours entirely', () => {
    // An accepted out-of-hours request, or a manual squeeze-in, lands on a day
    // the working hours say nothing about — it still has to be visible.
    expect(resolveTimelineRange(hours(9, 18), [span(0, 120, 30)]).startHour).toBe(0);
  });

  it('rounds a booking that ends part-way through an hour outwards', () => {
    // 20:45 + 90m = 22:15, so the grid has to run to 23:00 or the block's tail
    // is drawn past the last hour line.
    expect(resolveTimelineRange(null, [span(20, 90, 45)]).endHour).toBe(23);
  });

  it('falls back to the default range on a day with no hours at all', () => {
    // The screen passes null for a closed day; the grid still has to render
    // something, and it renders it dimmed.
    expect(resolveTimelineRange(null, [])).toEqual({ startHour: 7, endHour: 21 });
  });

  it('never runs past either end of the day', () => {
    const range = resolveTimelineRange(hours(0, 23, 0, 59), [span(23, 120)]);
    expect(range.startHour).toBe(0);
    expect(range.endHour).toBe(24);
  });
});
