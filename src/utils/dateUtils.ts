/**
 * Single source of truth for date/time display formatting across the app.
 * Two canonical output styles:
 *  - formatLongDate:  "Wednesday 8th June 2026"
 *  - formatShortDate: "08/06/2026"
 *  - formatTime12:    "09:00am" (zero-padded hour, always :MM, lowercase am/pm, no space)
 */

export const DAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export const DAY_NAMES_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_NAMES_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "8" -> "8th", "2" -> "2nd", "11" -> "11th", "23" -> "23rd" */
export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/**
 * Parses a "YYYY-MM-DD" string (or any string Date can parse, or a Date) into
 * a local Date at midnight, avoiding UTC-shift-by-one-day bugs from `new Date("YYYY-MM-DD")`.
 */
export function toLocalDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(input);
}

/** "Wednesday 8th June 2026" */
export function formatLongDate(input: string | Date): string {
  const date = toLocalDate(input);
  const weekday = DAY_NAMES_FULL[date.getDay()];
  const day = ordinalSuffix(date.getDate());
  const month = MONTH_NAMES_FULL[date.getMonth()];
  const year = date.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

/**
 * "Wednesday 8th June" — same as formatLongDate but without the year, for
 * near-term appointment dates (checkout confirmation, success) where the
 * year is noise rather than information.
 */
export function formatLongDateNoYear(input: string | Date): string {
  const date = toLocalDate(input);
  const weekday = DAY_NAMES_FULL[date.getDay()];
  const day = ordinalSuffix(date.getDate());
  const month = MONTH_NAMES_FULL[date.getMonth()];
  return `${weekday} ${day} ${month}`;
}

/** "08/06/2026" (DD/MM/YYYY) */
export function formatShortDate(input: string | Date): string {
  const date = toLocalDate(input);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formats a time value to "09:00am" / "1:00pm"-free, always-zero-padded 12-hour style.
 * Accepts:
 *  - 24-hour "HH:MM" or "HH:MM:SS" strings (e.g. "09:00", "14:30:00")
 *  - 12-hour strings with AM/PM in any case/spacing (e.g. "9:00 AM", "9:00am", "9:00 A.M.")
 *  - a Date object
 * Output: always two-digit minute, lowercase "am"/"pm", no space. The hour is
 * zero-padded for AM ("09:00am") but NOT for PM ("1:00pm", "7:00pm") — noon
 * and midnight are always "12:00pm"/"12:00am".
 * Examples: "09:00am", "1:00pm", "7:00pm", "12:00pm", "12:00am".
 */
export function formatTime12(input: string | Date): string {
  let hours: number;
  let minutes: number;

  if (input instanceof Date) {
    hours = input.getHours();
    minutes = input.getMinutes();
  } else {
    const trimmed = input.trim();
    const ampmMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)$/.exec(trimmed);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1]!, 10);
      minutes = parseInt(ampmMatch[2]!, 10);
      const isPM = ampmMatch[3]!.toLowerCase().startsWith('p');
      if (isPM && h !== 12) h += 12;
      else if (!isPM && h === 12) h = 0;
      hours = h;
    } else {
      const h24Match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
      if (!h24Match) {
        throw new Error(`formatTime12: unrecognized time format "${input}"`);
      }
      hours = parseInt(h24Match[1]!, 10);
      minutes = parseInt(h24Match[2]!, 10);
    }
  }

  const isPM = hours >= 12;
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;
  // AM hours are zero-padded ("09:00am"); PM hours are not ("1:00pm").
  const displayHourStr = isPM ? String(displayHour) : String(displayHour).padStart(2, '0');
  const paddedMinute = String(minutes).padStart(2, '0');
  const period = isPM ? 'pm' : 'am';
  return `${displayHourStr}:${paddedMinute}${period}`;
}

/**
 * formatTime12 that returns null instead of throwing on an unparseable value.
 * For rendering times that came from the database (e.g.
 * booking_reschedule_requests.requested_times, which is nullable and has
 * historically held loosely-formatted strings) — a throw inside a render
 * would take the whole screen down over one bad row.
 */
export function formatTime12Safe(input: string | Date | null | undefined): string | null {
  if (input === null || input === undefined || input === '') return null;
  try {
    return formatTime12(input);
  } catch {
    return null;
  }
}

/** Converts a 12-hour display string ("9:00 AM", "9:00am", etc.) to 24-hour "HH:MM". */
export function to24HourTime(input: string): string {
  const trimmed = input.trim();
  const ampmMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)$/.exec(trimmed);
  if (!ampmMatch) {
    const h24Match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
    if (h24Match) {
      return `${h24Match[1]!.padStart(2, '0')}:${h24Match[2]}`;
    }
    throw new Error(`to24HourTime: unrecognized time format "${input}"`);
  }
  let h = parseInt(ampmMatch[1]!, 10);
  const minutes = ampmMatch[2];
  const isPM = ampmMatch[3]!.toLowerCase().startsWith('p');
  if (isPM && h !== 12) h += 12;
  else if (!isPM && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${minutes}`;
}

/** Minutes → "1h 30m" / "2h" / "45m". Empty string for a non-positive
 *  length, so a caller with nothing to show renders nothing rather than
 *  "0m". The single source for this format: mapDbBookingToConfirmed derives
 *  a booking's duration through it, and the provider screens that recover a
 *  length for a legacy booking with no end_time format it through it too, so
 *  a recovered duration is indistinguishable from a stored one. */
export function formatDurationMinutes(totalMinutes: number): string {
  if (!(totalMinutes > 0)) return '';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h > 0 ? `${h}h` : ''}${h > 0 && m > 0 ? ' ' : ''}${m > 0 ? `${m}m` : ''}`;
}

/** "YYYY-MM-DD" from a Date, in local time (no UTC shift). */
export function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Today" / "Tomorrow" / "Yesterday" / null (caller falls back to a date format) for a given date. */
export function relativeDayLabel(input: string | Date): string | null {
  const date = toLocalDate(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((compare.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return null;
}

/** "Wednesday 8th" — weekday + ordinal day, no month/year (for compact section headers). */
export function formatSectionTitle(input: string | Date): string {
  const date = toLocalDate(input);
  const weekday = DAY_NAMES_FULL[date.getDay()];
  const day = ordinalSuffix(date.getDate());
  return `${weekday} ${day}`;
}

/** "2m ago" / "3h ago" / "5d ago" / falls back to formatShortDate beyond ~a week. */
export function timeAgo(input: string | Date): string {
  const date = toLocalDate(input);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(date);
}
