import type { MyWaitlistPlace, ProviderDepositPolicy } from "../../services/databaseService";
import { BookingService } from "../../services/bookingService";
import { toDepositPolicy } from "../cart/pricing";
import {
  formatDayRangeShortMonth,
  formatShortDayDate,
  formatTime12Safe,
  ordinalSuffix,
} from "../../utils/dateUtils";

/**
 * The client side of the waitlist: how a place reads, how long a held slot
 * has left, and what paying for it charges.
 *
 * A held slot is a 10-minute on_hold booking. It's paid for through the
 * normal checkout (prepare_checkout with waitlist_hold_id), and the 15
 * minutes keep running while the client pays. Missing them, or passing, takes
 * the client off that waitlist. See
 * supabase/migrations/20261113210000_waitlist_pays_at_confirm.sql.
 */

/** "2nd in line". A place the database couldn't count reads as just "In line". */
export function placeInLineLabel(place: number | null): string {
  if (place == null || !Number.isFinite(place) || place < 1) return "In line";
  return `${ordinalSuffix(Math.floor(place))} in line`;
}

/** "Any day", "18 – 30 Nov", or "18 Nov onward". */
export function waitlistDatesLabel(preferredDates: string[] | null): string {
  const from = preferredDates?.[0];
  if (!from) return "Any day";
  const to = preferredDates?.[1];
  if (to) return formatDayRangeShortMonth(from, to);
  const [, day, month] = formatShortDayDate(from).split(" ");
  return `${day} ${month} onward`;
}

/** Whole seconds left on a hold, never below 0. */
export function holdSecondsLeft(expiresAt: string | null, nowMs: number): number {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

/** "14:05" for a countdown. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Thu 20 Nov · 2:00pm" for an offered slot, or null if it can't be read. */
export function offeredSlotLabel(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const when = formatTime12Safe(time);
  return when ? `${formatShortDayDate(date)} · ${when}` : formatShortDayDate(date);
}

/** "2:00pm – 4:00pm" for a held slot, or just "2:00pm" when its length isn't known. */
export function heldTimeRangeLabel(time: string | null, durationMinutes: number | null): string | null {
  const start = formatTime12Safe(time);
  if (!start || !time || !durationMinutes || durationMinutes <= 0) return start;
  const [h = NaN, m = NaN] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return start;
  const endMinutes = h * 60 + m + durationMinutes;
  const end = formatTime12Safe(`${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`);
  return end ? `${start} – ${end}` : start;
}

/** "2:15pm": when a hold ended or ends, in the client's own clock. */
export function holdEndLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  return Number.isFinite(date.getTime()) ? formatTime12Safe(date) : null;
}

/** What a waitlist card shows. */
export type WaitlistCardState = "held" | "waiting" | "gone";

export function waitlistCardState(place: MyWaitlistPlace, nowMs: number): WaitlistCardState {
  if (place.status === "notified" && place.holdBookingId && holdSecondsLeft(place.offerExpiresAt, nowMs) > 0) {
    return "held";
  }
  if (place.status === "waiting") return "waiting";
  // 'expired', or a hold that ran out before the next refresh.
  return "gone";
}

/** Held first (they're on a clock), then waiting, then the ones that ended. */
export function sortWaitlistPlaces(places: MyWaitlistPlace[], nowMs: number): MyWaitlistPlace[] {
  const rank: Record<WaitlistCardState, number> = { held: 0, waiting: 1, gone: 2 };
  return [...places].sort((a, b) => {
    const diff = rank[waitlistCardState(a, nowMs)] - rank[waitlistCardState(b, nowMs)];
    return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * What the card is charged for a held slot's service, by the Cart's rule:
 * the provider's live deposit policy decides deposit or full price, since a
 * waitlist place never offered the client a choice.
 */
export function waitlistCheckoutCharge(
  price: number,
  policy: ProviderDepositPolicy | undefined,
): { charged: number; isDeposit: boolean; leftToPay: number } {
  const isDeposit = policy && !policy.depositAvailable ? false : !!policy?.depositOnly;
  const charged = isDeposit ? BookingService.calculateDeposit(price, toDepositPolicy(policy)) : price;
  return { charged, isDeposit, leftToPay: isDeposit ? Math.max(0, price - charged) : 0 };
}

/** The fields nextWaitingFor reads from a provider's waitlist entry. */
interface QueueEntry {
  id: string;
  service_id: string | null;
  status: string;
  position: number;
  created_at: string;
}

/**
 * Who a freed slot goes to next, the way the database picks: people waiting
 * for that service first, then people happy with any service, each in queue
 * order (position, then when they joined). `excludeId` leaves out the client
 * who has it now.
 */
export function nextWaitingFor<T extends QueueEntry>(entries: T[], serviceId: string | null, excludeId?: string): T | null {
  const inOrder = (a: T, b: T) => a.position - b.position || a.created_at.localeCompare(b.created_at);
  const waiting = entries.filter(e => e.status === "waiting" && e.id !== excludeId);
  const same = serviceId ? waiting.filter(e => e.service_id === serviceId).sort(inOrder) : [];
  const any = waiting.filter(e => e.service_id === null).sort(inOrder);
  return same[0] ?? any[0] ?? null;
}

/** "Jo" from "Jo Martin"; null when there's no name. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
