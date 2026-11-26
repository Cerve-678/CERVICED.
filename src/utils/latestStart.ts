/**
 * A service's latest start time (services.latest_start_time).
 *
 * The server is the real gate: enforce_booking_bookability refuses a booking
 * that starts after it, and get_services_open_within / get_providers_
 * availability only count starts at or before it. AvailabilityService uses
 * these helpers so the picker never offers a time the database then refuses.
 *
 * Times are plain UK clock times, the same clock booking_time uses. A start
 * exactly AT the latest start is allowed ("start by 3pm" includes 3pm).
 */

/** 'HH:MM' or 'HH:MM:SS' → minutes from midnight. null for none or junk. */
export function latestStartMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** True when a start (minutes from midnight) is later than the latest start. */
export function startsTooLate(startMinutes: number, latestMinutes: number | null): boolean {
  return latestMinutes !== null && startMinutes > latestMinutes;
}

/** '15:00:00' → '3pm', '15:30' → '3:30pm', '12:00' → '12pm'. '' for none. */
export function formatLatestStart(value: string | null | undefined): string {
  const mins = latestStartMinutes(value);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** The stored value → what the editor holds ('HH:MM', or '' for any time). */
export function latestStartToEditor(value: string | null | undefined): string {
  const mins = latestStartMinutes(value);
  if (mins === null) return '';
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
