// What the client is told about requests whose payment is held on their card
// rather than taken (supabase/migrations/20261113220000_request_card_hold.sql).
// Each request in a checkout has its own hold, taken only if its provider
// accepts; instant bookings are charged at checkout as before. Pure, so jest
// covers the wording.

import type { CheckoutHoldPlan as HoldPlan, RequestCardHold } from '../../services/databaseService';
import { formatTime12 } from '../../utils/dateUtils';

type HoldStatus = Pick<RequestCardHold, 'serviceName' | 'state' | 'actionDeadline'>;

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hasHolds = (plan: HoldPlan | null): plan is HoldPlan => !!plan && plan.heldPence > 0;

/** The payment sheet's main button. */
export function payButtonLabel(plan: HoldPlan | null, totalAmount: number): string {
  if (!hasHolds(plan)) return `Pay £${totalAmount.toFixed(2)}`;
  if (plan.chargeNowPence <= 0) return `Hold ${money(plan.heldPence)}`;
  return `Pay ${money(plan.chargeNowPence)} · Hold ${money(plan.heldPence)}`;
}

/** The line above the button explaining the hold, or null when nothing is held. */
export function holdPlanNote(plan: HoldPlan | null): string | null {
  if (!hasHolds(plan)) return null;
  const one = plan.requestCount === 1;
  // The card is saved whenever a hold is placed after the sheet's own
  // payment (create-payment-intent): more than one request, or a request
  // alongside instant bookings.
  const savesCard = plan.requestCount > 1 || plan.chargeNowPence > 0;
  return `${money(plan.heldPence)} for ${one ? 'your request' : `your ${plan.requestCount} requests`} is held on your card, not taken. ` +
    `${one ? "It's" : 'Each is'} only charged if the provider accepts. If not, the hold is released.` +
    (savesCard ? ` Your card is saved to your account so each request can be held on it separately.` : '');
}

/** The success screen's message once the checkout has gone through. */
export function checkoutSuccessMessage(plan: HoldPlan | null, totalAmount: number): string {
  if (!hasHolds(plan)) {
    return `Payment of £${totalAmount.toFixed(2)} has been processed successfully. ` +
      'Appointments have been booked and will show up in Bookings when confirmed by providers.';
  }
  if (plan.chargeNowPence <= 0) {
    return `${money(plan.heldPence)} is held on your card, not taken. ` +
      `You're only charged ${plan.requestCount === 1 ? "if it's accepted" : "for each request that's accepted"}. ` +
      'Your bank shows it as pending until then.';
  }
  const instant = Math.max(1, plan.bookingCount - plan.requestCount);
  return `${money(plan.chargeNowPence)} paid for ${count(instant, 'booking', 'bookings')} · ` +
    `${money(plan.heldPence)} held for ${count(plan.requestCount, 'request', 'requests')}, only charged if accepted.`;
}

/** A hold still waiting on the client's bank, its deadline not yet passed. */
export function holdNeedsCheck(hold: HoldStatus, now: Date = new Date()): boolean {
  return hold.state === 'needs_action' && !!hold.actionDeadline && Date.parse(hold.actionDeadline) > now.getTime();
}

/** The prompt for a hold the bank wants confirmed. */
export function holdCheckPrompt(hold: HoldStatus): { title: string; detail: string } {
  const by = hold.actionDeadline ? formatTime12(new Date(hold.actionDeadline)) : null;
  return {
    title: `Your bank wants to confirm the hold for the ${hold.serviceName} request.`,
    detail: `${by ? `Confirm by ${by}. ` : ''}Until you do, it isn't sent to the provider. ` +
      "If you skip it, the request is cancelled and nothing is held.",
  };
}

/** What happened to a hold once it's no longer waiting, or null while it is. */
export function holdResultLine(hold: HoldStatus): string | null {
  if (hold.state === 'dropped') return `Your ${hold.serviceName} request wasn't sent. Nothing is held on your card.`;
  if (hold.state === 'authorised') return `Done. Your ${hold.serviceName} request has gone to the provider.`;
  return null;
}
