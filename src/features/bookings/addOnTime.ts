// How much longer a booking's add-ons make it.
//
// Since universal add-ons, an add-on can carry extra time (service_add_ons.
// extra_minutes). A cart item's `duration` stays the SERVICE's own length;
// everything that needs the appointment's length (the time picker, chained
// back-to-back slots, the end_time sent to the server) goes through
// durationWithAddOns instead, so editing add-ons later never has to undo a
// length that was baked in. prepare_checkout and
// provider_create_manual_booking add the same minutes server-side.
import { parseDurationToMinutes } from '../../services/AvailabilityService';
import { formatDurationMinutes } from '../../utils/dateUtils';

export interface TimedAddOn {
  extraMinutes?: number | null;
}

/** An add-on a client has picked for one booking: what the booking sheets,
 *  the add-on picker and the cart all carry. `id` is the service_add_ons
 *  row id checkout prices it from. */
export interface ChosenAddOn {
  id: string | number;
  name: string;
  price: number;
  /** Minutes it adds to the appointment. Missing on carts saved before
   *  add-ons had extra time, which reads as none. */
  extraMinutes?: number;
}

/** Total extra minutes across the chosen add-ons. */
export function addOnExtraMinutes(addOns: readonly TimedAddOn[] | null | undefined): number {
  if (!addOns?.length) return 0;
  return addOns.reduce((sum, addOn) => {
    const minutes = Number(addOn.extraMinutes ?? 0);
    return sum + (Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0);
  }, 0);
}

/** The appointment's length as a duration string: the service's own
 *  duration plus its add-ons' extra time. Returns `duration` untouched when
 *  the add-ons add nothing, so a booking without timed add-ons behaves
 *  exactly as before. */
export function durationWithAddOns(
  duration: string,
  addOns: readonly TimedAddOn[] | null | undefined,
): string {
  const extra = addOnExtraMinutes(addOns);
  if (extra === 0) return duration;
  const base = /\d/.test(duration) ? parseDurationToMinutes(duration) : 60;
  return formatDurationMinutes(base + extra);
}

/** "+15 min", "+1 hr", "+1 hr 30 min". Empty for no extra time. */
export function formatAddOnExtraTime(minutes: number | null | undefined): string {
  const total = Math.round(Number(minutes ?? 0));
  if (!(total > 0)) return '';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `+${rest} min`;
  return rest > 0 ? `+${hours} hr ${rest} min` : `+${hours} hr`;
}
