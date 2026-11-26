
import { tr } from '../../i18n/translate';// Why a provider's schedule is closed. The reason is optional, and a client only
// ever sees it if the provider chose to say (get_provider_closure_reason). These
// values must match the CHECK on provider_schedule_closures.reason.
export const CLOSURE_REASONS = [
  { value: 'holiday', get label() { return tr('discover.page.holiday'); }, get clientLabel() { return tr('discover.page.onHoliday'); } },
  { value: 'time_off', get label() { return tr('discover.page.timeOff'); }, get clientLabel() { return tr('discover.page.takingSomeTimeOff'); } },
  { value: 'training', get label() { return tr('discover.page.training'); }, get clientLabel() { return tr('discover.page.awayOnTraining'); } },
  { value: 'fully_booked', get label() { return tr('discover.page.fullyBooked'); }, get clientLabel() { return tr('discover.page.fullyBooked'); } },
] as const;

export type ClosureReason = (typeof CLOSURE_REASONS)[number]['value'];

/** What a client is told, or null for a reason this build doesn't know. */
export function closureReasonForClient(reason: string | null | undefined): string | null {
  return CLOSURE_REASONS.find(r => r.value === reason)?.clientLabel ?? null;
}

/** Upcoming bookings the provider hasn't answered yet. Closing waits for every
 *  one: kept ("I can do it"), being moved, or cancelled (off the list). */
export function unansweredBookingCount(
  bookings: ReadonlyArray<{ id: string; moving: boolean }> | null,
  keptIds: ReadonlySet<string>,
): number {
  return bookings?.filter((b) => !b.moving && !keptIds.has(b.id)).length ?? 0;
}

/** Closing needs the list loaded (not failed, not still loading) and every
 *  booking on it answered. */
export function canCloseSchedule(
  bookings: ReadonlyArray<{ id: string; moving: boolean }> | null,
  keptIds: ReadonlySet<string>,
  loadFailed: boolean,
): boolean {
  return bookings !== null && !loadFailed && unansweredBookingCount(bookings, keptIds) === 0;
}
