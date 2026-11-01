/**
 * How far ahead a client may book a provider — the app's copy of the server's
 * public.provider_last_bookable_date(), which enforce_booking_bookability
 * checks every booking against. Keep the two in step.
 *
 * Two shapes:
 *  • Rolling (no release day): today + booking_window_days. 0 = no limit.
 *  • Monthly release (a release day 1–31 is set): the diary is open to the end
 *    of the current month, and next month opens on the release day at 09:00
 *    UTC — the same minute the cron tells followers. A day past the month's
 *    end (31 in a 30-day month) means its last day. booking_window_days is
 *    ignored.
 *
 * The monthly horizon is worked out from the clock rather than stored, so it
 * can't fail to advance: a provider who never opens the app still opens next
 * month on time.
 */

export interface BookingHorizonSettings {
  booking_window_days?: number | null;
  /** providers.automation_settings.scheduleReleaseDay */
  schedule_release_day?: number | null;
}

export const RELEASE_HOUR_UTC = 9;

/** automation_settings.scheduleReleaseDay arrives as raw JSON — a number,
 *  or a numeric string from older writes. Anything else means "not set". */
export function toReleaseDay(value: unknown): number | null {
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  return isMonthlyRelease(n as number | null) ? (n as number) : null;
}

export function isMonthlyRelease(day: number | null | undefined): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** The moment `releaseDay` opens next month, within the UTC month containing `now`. */
export function releaseMomentInMonth(releaseDay: number, now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(releaseDay, lastDay), RELEASE_HOUR_UTC));
}

/**
 * The last date (local midnight) a client may book, or null for no limit.
 */
export function lastBookableDate(settings: BookingHorizonSettings | null | undefined, now: Date = new Date()): Date | null {
  const releaseDay = settings?.schedule_release_day;
  if (isMonthlyRelease(releaseDay)) {
    const released = now.getTime() >= releaseMomentInMonth(releaseDay, now).getTime();
    // Last day of this UTC month, or of next month once released. Built as a
    // local date so callers compare it with their own local "today".
    const monthsAhead = released ? 2 : 1;
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 0));
    return new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  }
  const windowDays = settings?.booking_window_days ?? 60;
  if (windowDays <= 0) return null;
  const last = new Date(now);
  last.setHours(0, 0, 0, 0);
  last.setDate(last.getDate() + windowDays);
  return last;
}

/**
 * How many days, today included, a client can book: the number of days a
 * forward scan from today should look at. null = no limit.
 */
export function bookableDayCount(settings: BookingHorizonSettings | null | undefined, now: Date = new Date()): number | null {
  const last = lastBookableDate(settings, now);
  if (!last) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((last.getTime() - today.getTime()) / 86_400_000) + 1;
  return Math.max(0, days);
}

/** Whether `date` ('YYYY-MM-DD', local) is past what the provider has opened. */
export function isBeyondHorizon(settings: BookingHorizonSettings | null | undefined, date: string, now: Date = new Date()): boolean {
  const last = lastBookableDate(settings, now);
  if (!last) return false;
  return new Date(`${date}T00:00:00`).getTime() > last.getTime();
}

/** When a monthly-release provider next opens a month — for "Books open on…" copy. */
export function nextReleaseMoment(releaseDay: number, now: Date = new Date()): Date {
  const thisMonth = releaseMomentInMonth(releaseDay, now);
  if (now.getTime() < thisMonth.getTime()) return thisMonth;
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return releaseMomentInMonth(releaseDay, nextMonth);
}
