import type { AddToCartParams } from "../../contexts/CartContext";
import type { MyWaitlistPlace, RebookableService } from "../../services/databaseService";
import {
  formatDayRangeShortMonth,
  formatShortDayDate,
  formatTime12Safe,
  ordinalSuffix,
} from "../../utils/dateUtils";

/**
 * The client side of the waitlist: how a place reads, how long a held slot
 * has left, and the cart item that pays for it.
 *
 * A held slot is a 15-minute on_hold booking. It's paid for through the
 * normal checkout (prepare_checkout with waitlist_hold_id), and the 15
 * minutes keep running while the client pays. Missing them, or passing, takes
 * the client off that waitlist. See
 * supabase/migrations/20261112100000_waitlist_pays_at_confirm.sql.
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

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m` : ""}`.trim() || "1h";
}

/**
 * The cart item for a held slot: its fixed date and time, today's price, and
 * the hold it pays for. The cart doesn't let the time change, and checkout
 * sends waitlist_hold_id so the server reuses the held row.
 */
export function buildWaitlistHoldCartItem(args: {
  holdBookingId: string;
  holdExpiresAt: string;
  bookingDate: string;
  bookingTime: string;
  providerId: string;
  providerImage: string | null;
  live: RebookableService;
}): AddToCartParams {
  const { live } = args;
  return {
    providerName: live.providerDisplayName,
    providerDisplayName: live.providerDisplayName,
    providerSlug: live.providerSlug,
    providerId: args.providerId,
    providerImage: args.providerImage ? { uri: args.providerImage } : null,
    providerService: live.categoryName || live.name,
    service: {
      id: live.id,
      name: live.name,
      price: live.price,
      duration: durationLabel(live.durationMinutes),
      description: live.name,
      addOns: [],
    },
    quantity: 1,
    forceNewInstance: true,
    selectedDate: args.bookingDate,
    selectedTime: args.bookingTime.slice(0, 5),
    waitlistHold: { bookingId: args.holdBookingId, expiresAt: args.holdExpiresAt },
  };
}
