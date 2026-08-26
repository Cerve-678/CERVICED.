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

/** One cart line, reduced to just what the local checks need. */
export interface CartIssueEntry {
  itemId: string;
  /** Provider id where one is resolved, name otherwise — only ever compared
   *  against other entries built the same way. */
  providerKey: string;
  date: string | undefined;
  time: string | undefined;
  duration: string | undefined;
}

/** Every reason a cart card can be flagged with, in one place.
 *
 *  Most of these are word-for-word what AvailabilityService already returns
 *  for the same finding — deliberately, so the reason on a card never rewrites
 *  itself into different words when the server confirms what the local pass
 *  already said. Keeping them here rather than inlining them is what lets the
 *  two passes stay identical: change one of these and both move together.
 *  CartScreen maps the service's phrasings onto these via toCartIssue(). */
export const CART_ISSUE = {
  noSchedule: 'Pick a date and time for this service',
  overlap: 'This time slot conflicts with another service in your cart',
  slotTaken: 'This time slot is no longer available.',
  outsideHours: "This time is outside the provider's working hours.",
  dayUnavailable: 'Provider is not available on this date.',
  providerUnbookable: "This provider isn't taking bookings right now",
  serviceUnavailable: 'This service is no longer available from this provider. Please remove it to continue.',
  promoExpired: 'The promo code on this booking has expired — remove it or pick another',
  takenWhilePaying: 'This time was taken while you were paying — pick a new time',
  bookingFailed: "This service couldn't be booked — try again",
} as const;

/** Everything wrong with a cart that can be found WITHOUT a network call, as
 *  itemId → reason. Runs on every render, so a cart that cannot possibly check
 *  out says so before the client taps anything.
 *
 *  Ordered by what the client should fix first: a line with no time at all
 *  can't also be judged for overlapping something, so it reports that and
 *  nothing else.
 *
 *  A date or time that can't be parsed back reports as noSchedule rather than
 *  getting wording of its own. It shouldn't be possible — the sheet only ever
 *  writes formats this understands — and inventing copy for it would put a
 *  sentence about the app's internals in front of a client. From where they're
 *  standing the situation is identical to never having picked a time, and that
 *  message is both true and actionable. CartScreen logs the raw value for
 *  developers, which is where an impossible state actually needs to surface.
 *
 *  Back-to-back is NOT an overlap: a service ending at the minute the next one
 *  starts is exactly how a grouped appointment is built. */
export function findCartItemIssues(entries: CartIssueEntry[]): Map<string, string> {
  const issues = new Map<string, string>();

  const spans: { itemId: string; providerKey: string; date: string; start: number; end: number }[] = [];

  for (const entry of entries) {
    if (!entry.date || !entry.time) {
      issues.set(entry.itemId, CART_ISSUE.noSchedule);
      continue;
    }
    if (isNaN(new Date(entry.date).getTime()) || to24hMinutes(entry.time) === Number.MAX_SAFE_INTEGER) {
      issues.set(entry.itemId, CART_ISSUE.noSchedule);
      continue;
    }
    const start = to24hMinutes(entry.time);
    spans.push({
      itemId: entry.itemId,
      providerKey: entry.providerKey,
      date: entry.date,
      start,
      end: start + durationToMinutes(entry.duration),
    });
  }

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.providerKey !== b.providerKey || a.date !== b.date) continue;
      if (a.start >= b.end || b.start >= a.end) continue;
      issues.set(a.itemId, CART_ISSUE.overlap);
      issues.set(b.itemId, CART_ISSUE.overlap);
    }
  }

  return issues;
}
