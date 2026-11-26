/**
 * One booking as prepare_checkout receives it. The app's Cart and the
 * website's checkout both build their request here, so the two can't drift
 * apart on what they send: the server re-checks and re-prices everything, but
 * a field one side forgot (the out-of-hours ack, a mobile client's address)
 * would make that side's checkouts fail where the other's pass.
 */
import type { CheckoutIntentItem } from '../../services/databaseService';

export interface CheckoutIntentInput {
  providerId: string;
  serviceId: string;
  date: string;
  time: string;
  addOnIds: (string | number)[];
  useDeposit: boolean;
  notes: string | undefined;
  /** The single checkout tick: CERVICED's Terms, the provider's cancellation
   *  policy and, when the service has any, its safety information. */
  agreed: boolean;
  /** The provider's policy as the client was shown it. */
  policySnapshot: Record<string, unknown> | null | undefined;
  /** Only a mobile provider's booking carries the client's address. */
  mobileAddress?: { address: string; area: string | null } | null;
  promoCode?: string | null;
  /** The client accepted the out-of-hours confirmation for this time. */
  emergency?: boolean;
  /** A waitlist slot held for this client (the on_hold booking's id). */
  waitlistHoldId?: string | null;
}

export function buildCheckoutIntentItem(input: CheckoutIntentInput): CheckoutIntentItem {
  const address = input.mobileAddress?.address.trim();
  return {
    provider_id: input.providerId,
    service_id: input.serviceId,
    booking_date: input.date,
    booking_time: input.time,
    add_on_ids: input.addOnIds.map(String),
    use_deposit: input.useDeposit,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    // prepare_checkout rejects a mobile booking without an address and writes
    // it onto the held row; the area is derived by the DB when absent.
    ...(address ? { client_address: address, client_area: input.mobileAddress?.area ?? null } : {}),
    // The same tick answers both: it can't be ticked while safety information
    // it names is unread. prepare_checkout re-derives whether the service
    // needs the ack and rejects without it, whatever this says.
    safety_ack: input.agreed,
    policy_accepted: input.agreed,
    // The server freezes its own live copy and refuses when a money term
    // differs from this one.
    policy_snapshot: input.policySnapshot ?? null,
    ...(input.promoCode ? { promo_code: input.promoCode } : {}),
    // prepare_checkout requires the ack whenever the flag is set; it is the
    // out-of-hours confirmation the client accepted in the booking sheet,
    // not the Terms tick above.
    ...(input.emergency ? { emergency: true, emergency_ack: true } : {}),
    ...(input.waitlistHoldId ? { waitlist_hold_id: input.waitlistHoldId } : {}),
  };
}
