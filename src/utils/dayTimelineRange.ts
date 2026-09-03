/**
 * The hour range ProviderHomeScreen's day timeline draws.
 *
 * The timeline used to be fixed at 7am–9pm. That silently cut the top off any
 * provider who starts earlier — the hour labels stopped at 7am and every
 * earlier booking was clamped to `top: 0`, so a 3am appointment was drawn
 * against the 7am line and read as a 7am one. The range is now derived from
 * what the day actually holds.
 *
 * Takes minutes-since-midnight rather than time strings so it stays pure and
 * has no opinion on parsing — the screen already owns that.
 */

export const TL_DEFAULT_START_HOUR = 7;  // 7 AM
export const TL_DEFAULT_END_HOUR   = 21; // 9 PM

/** One booking on the day, as minutes since midnight plus its length. */
export interface TimelineSpan {
  startMins: number;
  durationMins: number;
}

/**
 * Whole hours spanning everything the day actually contains — the provider's
 * working hours (null on a day they're closed) and every booking on it,
 * including one sitting outside those hours: an accepted out-of-hours request,
 * or a manual squeeze-in. Never narrower than the 7am–9pm default, so an
 * ordinary day keeps the shape providers are used to.
 */
export function resolveTimelineRange(
  hours: { openMins: number; closeMins: number } | null,
  spans: readonly TimelineSpan[],
): { startHour: number; endHour: number } {
  let earliest = TL_DEFAULT_START_HOUR * 60;
  let latest   = TL_DEFAULT_END_HOUR   * 60;

  if (hours) {
    earliest = Math.min(earliest, hours.openMins);
    latest   = Math.max(latest,   hours.closeMins);
  }
  for (const span of spans) {
    earliest = Math.min(earliest, span.startMins);
    latest   = Math.max(latest,   span.startMins + span.durationMins);
  }

  return {
    startHour: Math.max(0,  Math.floor(earliest / 60)),
    endHour:   Math.min(24, Math.ceil(latest / 60)),
  };
}
