/**
 * Single source of truth for date/time display formatting across the app.
 * Two canonical output styles:
 *  - formatLongDate:  "Wednesday 8th June 2026"
 *  - formatShortDate: "08/06/2026" (order follows the user's region — see below)
 *  - formatTime12:    "09:00am" / "2:00pm" (AM hours are zero-padded, always :MM, lowercase am/pm, no space)
 *
 * Only the numeric short date is region-sensitive: "14/10/2026" (DMY) vs
 * "10/14/2026" (MDY). The month-name formats are unambiguous in any locale, so
 * they don't change by region. Region comes from regionStore (written by
 * DisplaySettingsContext); a caller can also pass a region explicitly (the
 * settings screen does, to preview an order without changing the stored one).
 * Currency is NOT localised anywhere — all pricing stays GBP (£).
 *
 * Month and weekday NAMES follow the app language (languageStore, written by
 * DisplaySettingsContext): "Wednesday 8th June 2026" in English, "miércoles,
 * 8 de junio de 2026" in Spanish. The exported English name arrays below stay
 * English on purpose — Becca parses typed day names against them — so display
 * code uses dayName()/monthName()/ordinalDay() instead. Times stay "2:00pm"
 * in every language for now.
 */

import { getRegion } from './regionStore';
import { REGION_OPTIONS } from './displaySettings';
import { getLanguage } from '../i18n/languageStore';
import { tr } from '../i18n/translate';

/** The date-part order for a region code (defaults to DMY for anything unknown). */
export function dateOrderForRegion(regionCode: string): 'DMY' | 'MDY' {
  return REGION_OPTIONS.find((r) => r.code === regionCode)?.dateOrder ?? 'DMY';
}

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

interface DateNames {
  readonly daysFull: readonly string[];
  readonly daysShort: readonly string[];
  readonly monthsFull: readonly string[];
  /** Month as it reads after a day number. Differs only in Polish, which
   *  uses the genitive ("8 czerwca", not "8 czerwiec"). */
  readonly monthsAfterDay: readonly string[];
  readonly monthsShort: readonly string[];
}

const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const DATE_NAMES: Readonly<Record<string, DateNames>> = {
  es: {
    daysFull: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    daysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    monthsFull: ES_MONTHS,
    monthsAfterDay: ES_MONTHS,
    monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  },
  fr: {
    daysFull: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    daysShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    monthsFull: FR_MONTHS,
    monthsAfterDay: FR_MONTHS,
    monthsShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  },
  de: {
    daysFull: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    daysShort: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
    monthsFull: DE_MONTHS,
    monthsAfterDay: DE_MONTHS,
    monthsShort: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  },
  pl: {
    daysFull: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
    daysShort: ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'],
    monthsFull: ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'],
    monthsAfterDay: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
    monthsShort: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
  },
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Weekday name (0 = Sunday) in the app language, capitalised to stand alone. */
export function dayName(dayIndex: number, style: 'full' | 'short' = 'full', lang: string = getLanguage()): string {
  const names = DATE_NAMES[lang];
  if (!names) return (style === 'full' ? DAY_NAMES_FULL : DAY_NAMES_ABBREV)[dayIndex] ?? '';
  return capitalize((style === 'full' ? names.daysFull : names.daysShort)[dayIndex] ?? '');
}

/** Month name (0 = January) in the app language, capitalised to stand alone. */
export function monthName(monthIndex: number, style: 'full' | 'short' = 'full', lang: string = getLanguage()): string {
  const names = DATE_NAMES[lang];
  if (!names) return (style === 'full' ? MONTH_NAMES_FULL : MONTH_NAMES_ABBREV)[monthIndex] ?? '';
  return capitalize((style === 'full' ? names.monthsFull : names.monthsShort)[monthIndex] ?? '');
}

/** Day of the month as an ordinal in the app language: "8th" in English,
 *  "8." in German and Polish, "1er" / "8" in French, "8" in Spanish. */
export function ordinalDay(day: number, lang: string = getLanguage()): string {
  switch (lang) {
    case 'de':
    case 'pl':
      return `${day}.`;
    case 'fr':
      return day === 1 ? '1er' : String(day);
    case 'es':
      return String(day);
    default:
      return ordinalSuffix(day);
  }
}

/** Weekday + day + month (+ year), in the word order each language uses. */
function formatWeekdayDayMonth(date: Date, withYear: boolean): string {
  const lang = getLanguage();
  const names = DATE_NAMES[lang];
  const year = date.getFullYear();
  if (!names) {
    const base = `${DAY_NAMES_FULL[date.getDay()]} ${ordinalSuffix(date.getDate())} ${MONTH_NAMES_FULL[date.getMonth()]}`;
    return withYear ? `${base} ${year}` : base;
  }
  const weekday = names.daysFull[date.getDay()];
  const month = names.monthsAfterDay[date.getMonth()];
  const day = date.getDate();
  switch (lang) {
    case 'es':
      return capitalize(`${weekday}, ${day} de ${month}${withYear ? ` de ${year}` : ''}`);
    case 'de':
      return `${weekday}, ${day}. ${month}${withYear ? ` ${year}` : ''}`;
    case 'pl':
      return capitalize(`${weekday}, ${day} ${month}${withYear ? ` ${year}` : ''}`);
    default:
      return capitalize(`${weekday} ${ordinalDay(day, lang)} ${month}${withYear ? ` ${year}` : ''}`);
  }
}

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
  return formatWeekdayDayMonth(toLocalDate(input), true);
}

/**
 * "Wednesday 8th June" — same as formatLongDate but without the year, for
 * near-term appointment dates (checkout confirmation, success) where the
 * year is noise rather than information.
 */
export function formatLongDateNoYear(input: string | Date): string {
  return formatWeekdayDayMonth(toLocalDate(input), false);
}

/** "Sat 3 Oct" — compact weekday + date for dense card headers. */
export function formatShortDayDate(input: string | Date): string {
  const date = toLocalDate(input);
  const day = getLanguage() === 'de' ? `${date.getDate()}.` : String(date.getDate());
  return `${dayName(date.getDay(), 'short')} ${day} ${monthName(date.getMonth(), 'short')}`;
}

/**
 * Numeric short date. Order follows the region: "14/10/2026" for DMY regions
 * (UK/IE/AU/CA), "10/14/2026" for MDY (US). Region defaults to the stored one;
 * pass `regionCode` to format for a specific region regardless of what's stored.
 */
export function formatShortDate(input: string | Date, regionCode: string = getRegion()): string {
  const date = toLocalDate(input);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return dateOrderForRegion(regionCode) === 'MDY'
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
}

/**
 * Formats a time value to "09:00am" / "2:00pm": AM hours are zero-padded;
 * PM hours use the natural 12-hour width.
 * Accepts:
 *  - 24-hour "HH:MM" or "HH:MM:SS" strings (e.g. "09:00", "14:30:00")
 *  - 12-hour strings with AM/PM in any case/spacing (e.g. "9:00 AM", "9:00am", "9:00 A.M.")
 *  - a Date object
 * Output: always two-digit minute, lowercase "am"/"pm", no space. The hour is
 * zero-padded for both AM and PM. Noon and midnight are always
 * "12:00pm"/"12:00am".
 * Examples: "09:00am", "2:00pm", "7:00pm", "12:00pm", "12:00am".
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
  const hours = h > 0 ? tr('common.duration.hours', { count: h }) : '';
  const minutes = m > 0 ? tr('common.duration.minutes', { count: m }) : '';
  return `${hours}${hours && minutes ? ' ' : ''}${minutes}`;
}

/** "YYYY-MM-DD" from a Date, in local time (no UTC shift). */
export function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Cutoff for fetching a provider's availability overrides: far enough back
 *  to cover every booking a day list can show, without pulling their whole
 *  history of one-off closures on every fetch. */
export function overridesFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return dateToYMD(d);
}

/** "Today" / "Tomorrow" / "Yesterday" / null (caller falls back to a date format) for a given date. */
export function relativeDayLabel(input: string | Date): string | null {
  const date = toLocalDate(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((compare.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return tr('common.date.today');
  if (diffDays === 1) return tr('common.date.tomorrow');
  if (diffDays === -1) return tr('common.date.yesterday');
  return null;
}

/** "Wednesday 8th" — weekday + ordinal day, no month/year (for compact section headers). */
export function formatSectionTitle(input: string | Date): string {
  const date = toLocalDate(input);
  const lang = getLanguage();
  if (lang === 'es' || lang === 'fr') return `${dayName(date.getDay())} ${ordinalDay(date.getDate(), lang)}`;
  if (lang === 'de' || lang === 'pl') return `${dayName(date.getDay())}, ${ordinalDay(date.getDate(), lang)}`;
  return `${DAY_NAMES_FULL[date.getDay()]} ${ordinalSuffix(date.getDate())}`;
}

/** "2m ago" / "3h ago" / "5d ago" / falls back to formatShortDate beyond ~a week. */
export function timeAgo(input: string | Date): string {
  const date = toLocalDate(input);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return tr('common.time.justNow');
  if (diffMinutes < 60) return tr('common.time.minutesAgo', { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return tr('common.time.hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return tr('common.time.daysAgo', { count: diffDays });
  return formatShortDate(date);
}


/**
 * Splits a stored `YYYY-MM-DD` date of birth back into the three separate
 * day/month/year fields the signup flow collects.
 *
 * Returns an empty object rather than blank strings when there is nothing to
 * split, so it can be spread into a registration update without clobbering
 * values already captured there.
 */
export function dobToParts(dob?: string | null): { dobDay: string; dobMonth: string; dobYear: string } | Record<string, never> {
  const [y, m, d] = (dob ?? '').split('-');
  return y && m && d ? { dobDay: d, dobMonth: m, dobYear: y } : {};
}
