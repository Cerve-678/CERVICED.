/**
 * Bookings store a UK wall-clock date and time (booking_date + booking_time,
 * no zone). Edge functions run in UTC, so `Date.parse("2026-07-01T17:00")`
 * reads 17:00 as UTC, an hour late during British Summer Time. This turns the
 * stored UK time into the real instant, in milliseconds.
 */
const LONDON = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

/** London's offset from UTC at `utcMs`, in ms (0 in winter, +1h in summer). */
function londonOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(LONDON.formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/** `date` is YYYY-MM-DD, `time` is HH:MM or HH:MM:SS, both UK local. NaN if unparseable. */
export function londonWallTimeToUtcMs(date: string, time: string): number {
  const naive = Date.parse(`${date}T${time}Z`);
  if (!Number.isFinite(naive)) return NaN;
  // Guess with the offset at the naive instant, then re-check at the result:
  // only differs within an hour of a clock change.
  const first = naive - londonOffsetMs(naive);
  return naive - londonOffsetMs(first);
}
