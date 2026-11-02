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
    const displayHour = hour >= 12 ? String(hour12) : String(hour12).padStart(2, '0');
    return `${displayHour}:${minute}${suffix}`;
  };

  const total = Math.max(0, endMinutes - startMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const lengthLabel = hours > 0 ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
  return `${toLabel(startMinutes)} – ${toLabel(endMinutes)} · ${lengthLabel}`;
}

/** Epoch ms for a 'YYYY-MM-DD' date plus minutes-from-midnight. Built from
 *  local midnight and then offset, which is the same construction the
 *  scheduler uses — parsing a date and a display time into one Date directly
 *  isn't reliable across platforms. */
function slotStartMs(date: string, minutesFromMidnight: number): number {
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return Number.NaN;
  d.setMinutes(minutesFromMidnight);
  return d.getTime();
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
  // The card says only THAT it clashes; the dialog names the service and
  // provider it clashes with. A card is a label, not a sentence — and the
  // appointment being clashed with usually isn't even in the cart to look at.
  clientClash: 'Clashes with one of your upcoming bookings',
  // Same split as clientClash above: the card says only THAT it clashes with
  // another cart item; the dialog names which provider. That message names a
  // provider whose section may be collapsed on screen, so it belongs in the
  // dialog, not printed whole on the card.
  crossProviderClash: 'Clashes with another service in your cart',
  slotTaken: 'This time slot is no longer available.',
  // The clock moved, nothing about the provider changed. Kept distinct from
  // every "provider" reason below on purpose: a cart item sat on overnight
  // used to be reported as the provider not taking bookings or not working
  // that day, which is a claim about them and usually false — they may well
  // still have the same slot free next week. Say what actually happened and
  // what fixes it.
  timePassed: 'This time has already passed — pick a new one',
  outsideHours: "This time is outside the provider's working hours.",
  dayUnavailable: 'Provider is not available on this date.',
  providerUnbookable: "This provider isn't taking bookings right now",
  serviceUnavailable: 'This service is no longer available from this provider. Please remove it to continue.',
  promoExpired: 'The promo code on this booking has expired — remove it or pick another',
  depositNoLongerOffered: 'This provider now requires payment in full — deposit is no longer available',
  depositNowRequired: 'This provider now requires a deposit — pay in full is no longer available',
  takenWhilePaying: 'This time was taken while you were paying — pick a new time',
  bookingFailed: "This service couldn't be booked — try again",
} as const;

/** What the client reads when reserving the cart's slots fails. */
export const RESERVE_FAILURE = {
  slotJustTaken: 'Someone has just booked one of these times. Pick another time and try again.',
  noConnection: "We couldn't connect just now. Check your connection and try again.",
  serverBusy: "We're having trouble connecting right now. Please try again in a moment.",
  generic: "We couldn't reserve that time. Please try again.",
} as const;

/** Turns a failed slot reservation into the alert the client sees.
 *
 *  A deliberate DB guard (a plain RAISE EXCEPTION, SQLSTATE P0001) is written
 *  for the client, so its own words are shown. Any other Postgres code is a
 *  technical failure and never shown raw — but the ones with a known cause get
 *  a sentence that says what happened instead of the catch-all:
 *  - 23505 / 23P01: the exact slot or the overlap rule was beaten by another
 *    booking landing at the same moment, which the availability check missed.
 *  - 57014: the statement ran past its time limit because the database was
 *    overloaded. Nothing about the cart is wrong; trying again works.
 *  - An empty code is the client library's own fetch failure ("TypeError:
 *    Network request failed"), which used to be shown word for word. */
export function describeReserveFailure(err: unknown): { title: string; message: string } {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === '23505' || code === '23P01') {
    return { title: 'Scheduling Conflict', message: RESERVE_FAILURE.slotJustTaken };
  }
  if (code === '57014') {
    return { title: 'Booking Not Completed', message: RESERVE_FAILURE.serverBusy };
  }
  if (code === '') {
    return { title: 'Booking Not Completed', message: RESERVE_FAILURE.noConnection };
  }
  if (typeof code === 'string' && code !== 'P0001') {
    return { title: 'Booking Not Completed', message: RESERVE_FAILURE.generic };
  }
  if (err instanceof Error && err.message) {
    return { title: 'Booking Not Completed', message: err.message.replace(/^Error:\s*/, '') };
  }
  return { title: 'Booking Not Completed', message: RESERVE_FAILURE.generic };
}

/** Everything wrong with a cart that can be found WITHOUT a network call, as
 *  itemId → reason. Runs on every render, so a cart that cannot possibly check
 *  out says so before the client taps anything.
 *
 *  Ordered by what the client should fix first: a line with no time at all
 *  can't also be judged for overlapping something, so it reports that and
 *  nothing else. A time that has already passed is the same shape of finding
 *  — it's reported on its own, and the item drops out of the overlap pass.
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
export function findCartItemIssues(
  entries: CartIssueEntry[],
  // Injectable so the elapsed-time check below is testable without waiting
  // for real time to pass.
  now: number = Date.now(),
): Map<string, string> {
  const issues = new Map<string, string>();

  // providerKey deliberately isn't carried onto a span — see the comment
  // below on why the overlap check no longer filters by it.
  const spans: { itemId: string; date: string; start: number; end: number }[] = [];

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
    // A time that has already gone is reported as exactly that, and takes no
    // further part in the overlap pass below — "clashes with another service"
    // is not useful advice about an appointment that can no longer happen at
    // all, and the one real fix (pick a new time) is the same either way.
    //
    // Checked here rather than left to the checkout round trip because it
    // needs no network: the cart already knows the date, the time and the
    // clock. Leaving it to AvailabilityService meant the card looked fine
    // until the client tapped Checkout, and the reason they got back then
    // depended on which of the provider lookups answered first.
    if (slotStartMs(entry.date, start) < now) {
      issues.set(entry.itemId, CART_ISSUE.timePassed);
      continue;
    }
    spans.push({
      itemId: entry.itemId,
      date: entry.date,
      start,
      end: start + durationToMinutes(entry.duration),
    });
  }

  // Deliberately NOT filtered by providerKey — the client being booked into
  // two DIFFERENT providers at once is exactly as impossible as double-
  // booking the same one, and it used to only surface at the checkout tap
  // (validateCartBookings' server-side pass, which never had this filter).
  // Catching it here means the card goes red the moment the clash exists,
  // not after an async round trip.
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.date !== b.date) continue;
      if (a.start >= b.end || b.start >= a.end) continue;
      issues.set(a.itemId, CART_ISSUE.overlap);
      issues.set(b.itemId, CART_ISSUE.overlap);
    }
  }

  return issues;
}
