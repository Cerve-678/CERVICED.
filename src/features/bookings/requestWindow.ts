// How long a provider has to answer a booking request. The database decides
// (process_expire_stale_pending_bookings); this keeps every line of copy
// saying the same number, and a test holds the two together.
export const REQUEST_RESPONSE_HOURS = 24;

/** The client's note on a booking waiting for an answer. */
export function clientRequestNote(providerName: string): string {
  return `${providerName} has ${REQUEST_RESPONSE_HOURS} hours to accept this request. If they don't answer by then, or by your appointment time if that's sooner, it's cancelled automatically and anything you paid is refunded in full.`;
}

/** The provider's note on a request they haven't answered. */
export const PROVIDER_REQUEST_NOTE = `You have ${REQUEST_RESPONSE_HOURS} hours to answer. After that, or at the appointment time if that's sooner, it's cancelled automatically and the client is refunded.`;
