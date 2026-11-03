import type { AddToCartParams } from "../../contexts/CartContext";
import type { RebookableService } from "../../services/databaseService";
import type { ConfirmedBooking } from "../../types/booking";

type AddOn = RebookableService["addOns"][number];

/**
 * The past booking's add-ons, split by whether the provider still offers
 * them. Matched by name against the live list, so a kept add-on carries
 * today's price and real id; one the provider has since removed or
 * deactivated is never re-booked from the old snapshot.
 */
export function rebookAddOns(
  booking: ConfirmedBooking,
  live: RebookableService,
): { kept: AddOn[]; dropped: string[] } {
  const previous = booking.addOns ?? [];
  const liveByName = new Map(live.addOns.map((a) => [a.name, a]));
  const kept: AddOn[] = [];
  const dropped: string[] = [];
  for (const addOn of previous) {
    const match = liveByName.get(addOn.name);
    if (match) kept.push(match);
    else dropped.push(addOn.name);
  }
  return { kept, dropped };
}

function durationLabel(minutes: number, fallback: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m` : ""}`.trim() || fallback;
}

/**
 * A past booking as a new cart item, at today's price, duration and add-ons.
 *
 * The one way every "book again" entry point (Bookings, Booking Detail,
 * Becca) builds its cart item, so they can't drift on what a rebook carries.
 * `notes` are what changed since last time, in plain words, for the caller
 * to show alongside "added to your cart".
 */
export function buildRebookCartItem(
  booking: ConfirmedBooking,
  live: RebookableService,
  providerId: string,
  includeAddOns: boolean,
): { item: AddToCartParams; notes: string[] } {
  const { kept, dropped } = rebookAddOns(booking, live);
  const notes: string[] = [];
  if (Math.abs(live.price - booking.price) > 0.005) {
    notes.push(`The price is now £${live.price.toFixed(2)} (was £${booking.price.toFixed(2)}).`);
  }
  if (includeAddOns && dropped.length > 0) {
    notes.push(
      `${dropped.join(", ")} ${dropped.length === 1 ? "is" : "are"} no longer offered and ${dropped.length === 1 ? "was" : "were"} not added.`,
    );
  }
  return {
    item: {
      providerName: booking.providerName,
      providerDisplayName: live.providerDisplayName,
      // Without providerSlug the cart's provider logo can't open the profile
      // and shows a "couldn't open that provider's profile" alert instead.
      providerSlug: live.providerSlug,
      providerId,
      // providerImage can be a plain string or an {uri} object depending on
      // where the snapshot came from — Image requires {uri}, so a raw string
      // here silently renders nothing in the cart.
      providerImage: typeof booking.providerImage === "string" ? { uri: booking.providerImage } : booking.providerImage,
      providerService: booking.providerService,
      service: {
        id: live.id,
        name: live.name,
        price: live.price,
        duration: durationLabel(live.durationMinutes, booking.duration),
        description: booking.providerService,
        addOns: includeAddOns ? kept : [],
      },
      quantity: 1,
      // Rebooking the same provider/service that's already in the cart must
      // create a second, independently-schedulable appointment, not silently
      // bump the existing item's quantity onto one shared slot.
      forceNewInstance: true,
    },
    notes,
  };
}
