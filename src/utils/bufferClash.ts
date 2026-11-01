/**
 * Whether a new booking lands inside the buffer time kept clear around an
 * existing one — not on top of it (that's a plain double-booking), but close
 * enough that the live bookings_no_overlap constraint still refuses it.
 *
 * The constraint compares buffer-padded ranges: each existing booking's
 * effective_start/effective_end (padded with its own buffers by the
 * compute_booking_effective_range trigger) against the new booking padded
 * with its own service's buffers. Mirrors that, so a screen can say why
 * before the database does.
 */

export interface PaddedBooking {
  booking_time: string; // 'HH:MM:SS'
  /** 'YYYY-MM-DDTHH:MM:SS', no zone. */
  effective_start?: string | null;
  effective_end?: string | null;
}

export interface BufferClash<B extends PaddedBooking> {
  booking: B;
  /** True when the new booking sits after the clashing one. */
  after: boolean;
  /** Nearest start on the same side that clears it, 'HH:MM:00', or null if
   *  that would fall outside the day. */
  suggestedTime: string | null;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** A zone-less timestamp as minutes from midnight of `dayYMD`. A buffer can
 *  push either side into the neighbouring day, so this goes negative or past
 *  1440 rather than wrapping. */
export function minutesFromDay(ts: string, dayYMD: string): number {
  const [d, t = '00:00'] = ts.split(/[T ]/);
  const dayDiff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${dayYMD}T00:00:00Z`)) / 86400000);
  return dayDiff * 1440 + timeToMinutes(t);
}

function minutesToHHMMSS(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
}

/**
 * @param bookings  the provider's bookings that still occupy time (callers
 *                  drop cancelled / no-show, the set the constraint ignores)
 * @param dayYMD    the new booking's date
 * @param start     new start, minutes from midnight
 * @param duration  new booking's total minutes (service + any extra time)
 * @param buffer    the new booking's own buffers
 */
export function findBufferClash<B extends PaddedBooking>(
  bookings: B[],
  dayYMD: string,
  start: number,
  duration: number,
  buffer: { before: number; after: number },
): BufferClash<B> | null {
  const padStart = start - buffer.before;
  const padEnd = start + duration + buffer.after;
  const hit = bookings.find(b =>
    !!b.effective_start && !!b.effective_end
    && padStart < minutesFromDay(b.effective_end, dayYMD)
    && padEnd > minutesFromDay(b.effective_start, dayYMD),
  );
  if (!hit) return null;
  const after = timeToMinutes(hit.booking_time) <= start;
  const suggested = after
    ? minutesFromDay(hit.effective_end!, dayYMD) + buffer.before
    : minutesFromDay(hit.effective_start!, dayYMD) - buffer.after - duration;
  return {
    booking: hit,
    after,
    suggestedTime: suggested >= 0 && suggested + duration <= 1440 ? minutesToHHMMSS(suggested) : null,
  };
}
