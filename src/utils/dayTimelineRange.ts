/**
 * The hour range ProviderHomeScreen's day timeline draws.
 *
 * The timeline used to be fixed at 7am–9pm. That silently cut the top off any
 * provider who starts earlier. The range is now derived from what the day
 * actually holds.
 *
 * Takes minutes-since-midnight rather than time strings so it stays pure and
 * has no opinion on parsing — the screen already owns that.
 */

export const TL_DEFAULT_START_HOUR = 7;
export const TL_DEFAULT_END_HOUR = 21;

export interface TimelineSpan {
  startMins: number;
  durationMins: number;
}

/**
 * Whole hours spanning the provider's working hours and every booking on the
 * day. The range is never narrower than 7am–9pm and never leaves the day.
 */
export function resolveTimelineRange(
  hours: { openMins: number; closeMins: number } | null,
  spans: readonly TimelineSpan[],
): { startHour: number; endHour: number } {
  let earliest = TL_DEFAULT_START_HOUR * 60;
  let latest = TL_DEFAULT_END_HOUR * 60;

  if (hours) {
    earliest = Math.min(earliest, hours.openMins);
    latest = Math.max(latest, hours.closeMins);
  }
  for (const span of spans) {
    earliest = Math.min(earliest, span.startMins);
    latest = Math.max(latest, span.startMins + span.durationMins);
  }

  return {
    startHour: Math.max(0, Math.floor(earliest / 60)),
    endHour: Math.min(24, Math.ceil(latest / 60)),
  };
}
