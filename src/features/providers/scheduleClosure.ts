// Why a provider's schedule is closed. The reason is optional, and a client only
// ever sees it if the provider chose to say (get_provider_closure_reason). These
// values must match the CHECK on provider_schedule_closures.reason.
export const CLOSURE_REASONS = [
  { value: 'holiday', label: 'Holiday', clientLabel: 'On holiday' },
  { value: 'time_off', label: 'Time off', clientLabel: 'Taking some time off' },
  { value: 'training', label: 'Training', clientLabel: 'Away training' },
  { value: 'fully_booked', label: 'Fully booked', clientLabel: 'Fully booked' },
] as const;

export type ClosureReason = (typeof CLOSURE_REASONS)[number]['value'];

/** What a client is told, or null for a reason this build doesn't know. */
export function closureReasonForClient(reason: string | null | undefined): string | null {
  return CLOSURE_REASONS.find(r => r.value === reason)?.clientLabel ?? null;
}

/** Closing when full is only for a provider with the waitlist off: a closed
 *  schedule doesn't offer freed slots to the waitlist. Missing means on. */
export function canAutoCloseWhenFull(waitlistEnabled: boolean | null | undefined): boolean {
  return waitlistEnabled === false;
}
