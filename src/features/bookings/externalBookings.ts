/**
 * "Booked elsewhere" entries — a client's own note of a booking they made on a
 * link-only provider's booking page. CERVICED doesn't handle these bookings;
 * the entry only keeps them alongside the client's CERVICED bookings.
 *
 * Pure helpers, so the upcoming/past split and the labels are testable
 * without a screen. Times are the client's local wall-clock time, the same
 * convention every other client booking date uses (see dateUtils.toLocalDate).
 */
import type { ClientExternalBookingWithProvider } from '../../services/databaseService';
import { toLocalDate } from '../../utils/dateUtils';

/** The entry's start as a local Date. */
export function externalBookingStart(entry: Pick<ClientExternalBookingWithProvider, 'booking_date' | 'start_time'>): Date {
  const day = toLocalDate(entry.booking_date);
  const [h = '0', m = '0'] = entry.start_time.split(':');
  day.setHours(Number(h), Number(m), 0, 0);
  return day;
}

/** Upcoming soonest first; past most recent first. An entry stays upcoming
 *  until its start time has passed. */
export function splitExternalBookings<T extends Pick<ClientExternalBookingWithProvider, 'booking_date' | 'start_time'>>(
  entries: readonly T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const withStart = entries.map(entry => ({ entry, start: externalBookingStart(entry).getTime() }));
  const nowMs = now.getTime();
  const upcoming = withStart
    .filter(row => row.start >= nowMs)
    .sort((a, b) => a.start - b.start)
    .map(row => row.entry);
  const past = withStart
    .filter(row => row.start < nowMs)
    .sort((a, b) => b.start - a.start)
    .map(row => row.entry);
  return { upcoming, past };
}

const KNOWN_BOOKING_SITES: readonly [string, string][] = [
  ['fresha.com', 'Fresha'],
  ['treatwell.co.uk', 'Treatwell'],
  ['treatwell.com', 'Treatwell'],
  ['acuityscheduling.com', 'Acuity'],
  ['as.me', 'Acuity'],
  ['booksy.com', 'Booksy'],
  ['vagaro.com', 'Vagaro'],
  ['squareup.com', 'Square'],
  ['square.site', 'Square'],
  ['setmore.com', 'Setmore'],
  ['calendly.com', 'Calendly'],
  ['timely.com', 'Timely'],
  ['gettimely.com', 'Timely'],
  ['phorest.com', 'Phorest'],
  ['styleseat.com', 'StyleSeat'],
];

/** "Fresha", "Treatwell" … for the "Booked on X" tag, from the provider's
 *  link. Falls back to "their site" rather than printing a raw hostname. */
export function bookingSiteName(url: string | null | undefined): string {
  if (!url) return 'their site';
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return 'their site';
  }
  const match = KNOWN_BOOKING_SITES.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match ? match[1] : 'their site';
}

/** "Booked on Fresha" / "Booked on their site". */
export function bookedOnLabel(url: string | null | undefined): string {
  return `Booked on ${bookingSiteName(url)}`;
}

/** The line every booked-elsewhere surface carries, so the wording stays one. */
export const EXTERNAL_BOOKING_DISCLAIMER =
  "CERVICED doesn't handle bookings made on other sites — we just keep track of them, so your beauty life stays organised.";
