import { parseDurationToMinutes } from '../../services/AvailabilityService';

/** Sort key for 12- or 24-hour booking times. Invalid values deliberately sort last. */
export function to24hMinutes(time: string | undefined): number {
  if (!time) return Number.MAX_SAFE_INTEGER;

  const ampm = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]\.?$/.exec(time.trim());
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3]!.toLowerCase() === 'p') hour += 12;
    return hour * 60 + Number(ampm[2]);
  }

  const h24 = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (h24) return Number(h24[1]) * 60 + Number(h24[2]);
  return Number.MAX_SAFE_INTEGER;
}

/** Keeps display spans aligned with the scheduler's duration parser. */
export function durationToMinutes(duration: string | undefined): number {
  if (!duration || !/\d/.test(duration)) return 0;
  return parseDurationToMinutes(duration);
}

/** Formats a grouped booking's start, end, and total duration. */
export function formatTimeSpan(startMinutes: number, endMinutes: number): string {
  const toLabel = (minutes: number) => {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = String(minutes % 60).padStart(2, '0');
    const suffix = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${suffix === 'am' ? String(hour12).padStart(2, '0') : hour12}:${minute}${suffix}`;
  };

  const total = Math.max(0, endMinutes - startMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const lengthLabel = hours > 0 ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
  return `${toLabel(startMinutes)} – ${toLabel(endMinutes)} · ${lengthLabel}`;
}

/** One scheduled cart line, reduced to just what an overlap check needs. */
export interface CartOverlapEntry {
  itemId: string;
  /** Provider id where one is resolved, name otherwise — only ever compared
   *  against other entries built the same way. */
  providerKey: string;
  date: string | undefined;
  time: string | undefined;
  duration: string | undefined;
}

/** The reason shown on a cart card for this finding. Word-for-word what
 *  AvailabilityService.validateCartBookings returns for the same clash, so the
 *  message doesn't rewrite itself when the server-side check confirms it at
 *  checkout. */
export const CART_OVERLAP_MESSAGE = 'This time slot conflicts with another service in your cart';

/** Cart lines booked over each other with the same provider on the same day,
 *  as itemId → reason. Needs no network — everything compared is already in
 *  the cart — so a cart that cannot possibly check out can say so before the
 *  client taps anything.
 *
 *  Back-to-back is NOT an overlap: a service ending at the minute the next one
 *  starts is exactly how a grouped appointment is built. Lines with no date,
 *  no time, or an unparseable time are skipped rather than guessed at — those
 *  are a different problem, reported separately at checkout. */
export function findCartOverlapIssues(entries: CartOverlapEntry[]): Map<string, string> {
  const issues = new Map<string, string>();

  const spans = entries
    .map(entry => {
      if (!entry.date || !entry.time) return null;
      const start = to24hMinutes(entry.time);
      if (start === Number.MAX_SAFE_INTEGER) return null;
      return { ...entry, start, end: start + durationToMinutes(entry.duration) };
    })
    .filter((span): span is NonNullable<typeof span> => span !== null);

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.providerKey !== b.providerKey || a.date !== b.date) continue;
      if (a.start >= b.end || b.start >= a.end) continue;
      issues.set(a.itemId, CART_OVERLAP_MESSAGE);
      issues.set(b.itemId, CART_OVERLAP_MESSAGE);
    }
  }

  return issues;
}
