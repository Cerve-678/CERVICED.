import { formatShortDayDate } from './dateUtils';

/**
 * How far ahead a client may book a provider — the app's copy of the server's
 * public.provider_last_bookable_date(), which enforce_booking_bookability
 * checks every booking against. Keep the two in step.
 *
 * Two shapes:
 *  • Rolling (no release day): today + booking_window_days. 0 = no limit.
 *  • Monthly release (a release day 1–31 is set): the diary is open to the end
 *    of the current month, and next month opens on the release day at the
 *    provider's release time (UK time, 9am if they never chose one) — the
 *    cron tells followers within five minutes of it. Months are UK months
 *    too. A day past the month's end (31 in a 30-day month) means its last
 *    day. booking_window_days is ignored.
 *
 * The monthly horizon is worked out from the clock rather than stored, so it
 * can't fail to advance: a provider who never opens the app still opens next
 * month on time.
 */

export interface BookingHorizonSettings {
  booking_window_days?: number | null;
  /** providers.automation_settings.scheduleReleaseDay */
  schedule_release_day?: number | null;
  /** providers.automation_settings.scheduleReleaseTime, 'HH:MM' UK time.
   *  Missing or unreadable = DEFAULT_RELEASE_TIME. */
  schedule_release_time?: string | null;
}

/** What a release day meant before providers could pick a time, and still
 *  means when they haven't. The server uses the same default. */
export const DEFAULT_RELEASE_TIME = '09:00';

const RELEASE_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** automation_settings.scheduleReleaseTime as stored → a usable 'HH:MM'. */
export function toReleaseTime(value: unknown): string {
  return typeof value === 'string' && RELEASE_TIME_PATTERN.test(value) ? value : DEFAULT_RELEASE_TIME;
}

/** Whether a value is a release time the server will read as-is. */
export function isReleaseTime(value: unknown): value is string {
  return typeof value === 'string' && RELEASE_TIME_PATTERN.test(value);
}

/** '19:00' → '7pm', '09:30' → '9:30am', '00:00' → 'midnight', '12:00' →
 *  'midday'. For "New slots drop on the 5th at 7pm". */
export function releaseTimeLabel(time: string | null | undefined): string {
  const [h, m] = toReleaseTime(time).split(':').map(Number) as [number, number];
  if (m === 0 && h === 0) return 'midnight';
  if (m === 0 && h === 12) return 'midday';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

// ── UK time ─────────────────────────────────────────────────────────────────
// The server works in Europe/London. Hermes' Intl time-zone support varies by
// platform, so the UK rule is written out: British Summer Time runs from
// 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of
// October.

function lastSundayUtc(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** Minutes the UK is ahead of UTC at `instant`: 60 in summer, else 0. */
export function ukOffsetMinutes(instant: Date): number {
  const year = instant.getUTCFullYear();
  const start = Date.UTC(year, 2, lastSundayUtc(year, 2), 1);
  const end = Date.UTC(year, 9, lastSundayUtc(year, 9), 1);
  const t = instant.getTime();
  return t >= start && t < end ? 60 : 0;
}

/** `instant` shifted so its UTC getters read UK wall-clock time. */
function ukWall(instant: Date): Date {
  return new Date(instant.getTime() + ukOffsetMinutes(instant) * 60_000);
}

/** The instant a UK wall-clock time happens. Matches Postgres's AT TIME ZONE
 *  'Europe/London' at the edges: the hour that happens twice in October and
 *  the hour that never happens in March both read as GMT. */
function fromUkWall(year: number, month: number, day: number, minutes: number): Date {
  const asGmt = new Date(Date.UTC(year, month, day, 0, minutes));
  if (ukOffsetMinutes(asGmt) === 0) return asGmt;
  const asBst = new Date(asGmt.getTime() - 60 * 60_000);
  return ukOffsetMinutes(asBst) === 60 ? asBst : asGmt;
}

function releaseMinutes(time: string | null | undefined): number {
  const [h, m] = toReleaseTime(time).split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** The release moment in UK month `month` of `year` (month may overflow). */
function releaseMomentFor(year: number, month: number, releaseDay: number, time: string | null | undefined): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fromUkWall(y, m, Math.min(releaseDay, lastDay), releaseMinutes(time));
}

/** automation_settings.scheduleReleaseDay arrives as raw JSON — a number,
 *  or a numeric string from older writes. Anything else means "not set". */
export function toReleaseDay(value: unknown): number | null {
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  return isMonthlyRelease(n as number | null) ? (n as number) : null;
}

export function isMonthlyRelease(day: number | null | undefined): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** The moment `releaseDay` opens next month, within the UK month containing `now`. */
export function releaseMomentInMonth(releaseDay: number, now: Date, time?: string | null): Date {
  const wall = ukWall(now);
  return releaseMomentFor(wall.getUTCFullYear(), wall.getUTCMonth(), releaseDay, time);
}

/**
 * The last date (local midnight) a client may book, or null for no limit.
 */
export function lastBookableDate(settings: BookingHorizonSettings | null | undefined, now: Date = new Date()): Date | null {
  const releaseDay = settings?.schedule_release_day;
  if (isMonthlyRelease(releaseDay)) {
    const released = now.getTime() >= releaseMomentInMonth(releaseDay, now, settings?.schedule_release_time).getTime();
    // Last day of this UK month, or of next month once released. Built as a
    // local date so callers compare it with their own local "today".
    const monthsAhead = released ? 2 : 1;
    const wall = ukWall(now);
    const end = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + monthsAhead, 0));
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
export function nextReleaseMoment(releaseDay: number, now: Date = new Date(), time?: string | null): Date {
  const thisMonth = releaseMomentInMonth(releaseDay, now, time);
  if (now.getTime() < thisMonth.getTime()) return thisMonth;
  const wall = ukWall(now);
  return releaseMomentFor(wall.getUTCFullYear(), wall.getUTCMonth() + 1, releaseDay, time);
}

/**
 * When `date` ('YYYY-MM-DD', local) becomes bookable, for "opens on…" copy on
 * a day past the window. null when there is no limit.
 *  • Rolling: the day `booking_window_days` before it (local midnight).
 *  • Monthly release: the release moment in the month before the date's
 *    month, so a day in December opens on November's release day at the
 *    release time.
 */
export function whenDateOpens(settings: BookingHorizonSettings | null | undefined, date: string, now: Date = new Date()): Date | null {
  const releaseDay = settings?.schedule_release_day;
  const target = new Date(`${date}T00:00:00`);
  if (isMonthlyRelease(releaseDay)) {
    return releaseMomentFor(target.getFullYear(), target.getMonth() - 1, releaseDay, settings?.schedule_release_time);
  }
  const windowDays = settings?.booking_window_days ?? 60;
  if (windowDays <= 0) return null;
  const opens = new Date(target);
  opens.setDate(opens.getDate() - windowDays);
  return opens.getTime() > now.getTime() ? opens : null;
}

/**
 * The plain-English line under "How far ahead clients can book" on the
 * Scheduling screen, for a rolling window: what clients can book today and
 * what they see past it. 0 = no limit.
 */
export function rollingWindowExplainer(windowDays: number, now: Date = new Date()): string {
  const last = lastBookableDate({ booking_window_days: windowDays }, now);
  if (!last) return 'Clients can book any date in the future.';
  return `Today clients can book up to ${formatShortDayDate(last)}. This moves forward one day every day. `
    + 'Days after it are greyed out for clients, and tapping one tells them the date it opens.';
}

/** Parses the Scheduling screen's window choice for saving. '0' is "Any
 *  time" and must stay 0; only something unreadable falls back to 60. */
export function parseBookingWindowDays(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 60;
}

export interface ReleaseSettings {
  day: number | null;
  time: string;
}

/**
 * What to write to automation_settings when a screen saves its release
 * choice: only the keys that changed since the screen loaded them, so a save
 * here never puts back an older value the other editing screen has since
 * changed. null = nothing to write. Turning the release day off removes the
 * day and keeps the time, so turning it back on starts from the same time.
 */
export function releaseSettingsPatch(
  loaded: ReleaseSettings,
  next: ReleaseSettings,
): { set: { scheduleReleaseDay?: number; scheduleReleaseTime?: string }; remove: 'scheduleReleaseDay'[] } | null {
  const set: { scheduleReleaseDay?: number; scheduleReleaseTime?: string } = {};
  const remove: 'scheduleReleaseDay'[] = [];
  if (next.day !== loaded.day) {
    if (next.day != null) set.scheduleReleaseDay = next.day;
    else remove.push('scheduleReleaseDay');
  }
  if (next.day != null && next.time !== loaded.time) set.scheduleReleaseTime = next.time;
  return Object.keys(set).length || remove.length ? { set, remove } : null;
}
