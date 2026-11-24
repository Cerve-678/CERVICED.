/**
 * The website's checkout, after sign-in: the policies tick, then a 5-minute
 * hold on the time (prepare_checkout), then Stripe, then Booked. These are its
 * rules, kept apart from the screen so they can be tested.
 *
 * The amounts all come from the server: prepare_checkout prices the booking
 * and get_checkout_hold_plan says what the card is charged now (or only held,
 * for a request). The page never works a price out itself.
 */
import { buildCheckoutIntentItem } from '../features/cart/checkoutIntent';
import type { SettledCheckout } from '../features/cart/checkoutOutcome';
import type { CheckoutFee, CheckoutHoldPlan, CheckoutIntentItem } from '../services/databaseService';
import { resolveDepositMode } from '../utils/depositPolicy';
import type { WebBookingChoice } from './webBooking';

export function webCheckoutItem(args: {
  providerId: string;
  choice: WebBookingChoice;
  agreed: boolean;
  /** Set only for a mobile provider, who comes to the client. */
  mobileAddress: string | null;
}): CheckoutIntentItem {
  const { service, result } = args.choice;
  return buildCheckoutIntentItem({
    providerId: args.providerId,
    serviceId: service.dbId,
    date: result.date,
    time: result.time,
    addOnIds: result.selectedAddOns.map(addOn => addOn.id),
    useDeposit: result.isDepositOnly,
    notes: result.notes,
    agreed: args.agreed,
    policySnapshot: result.policySnapshot,
    // The website has no account area to send; the database works it out
    // from the address.
    mobileAddress: args.mobileAddress !== null ? { address: args.mobileAddress, area: null } : null,
    emergency: Boolean(result.emergencyRequest),
    // The code the sheet's summary already took off. prepare_checkout
    // re-validates it and works the discount out itself.
    promoCode: result.promoCode ?? null,
  });
}

/** The provider flagged a patch test or pregnancy information for this service,
 *  so the tick also confirms the client has seen it (prepare_checkout
 *  re-checks this from the service row). */
export function serviceNeedsSafetyAck(service: WebBookingChoice['service']): boolean {
  return Boolean(service.patchTestRequired) || service.isPregnancySafe === false;
}

/** The provider keeps the deposit even after a cancellation in good time. */
export function depositIsNonRefundable(choice: WebBookingChoice): boolean {
  const snapshot = choice.result.policySnapshot;
  return snapshot?.['depositNonRefundable'] === true && resolveDepositMode(snapshot) !== 'full_only';
}

/** The fees that need their own tick box, split the way the app's payment
 *  sheet splits them: late arrival / no-show, and late cancellation. */
export function feeGroups(fees: CheckoutFee[]): { visit: CheckoutFee[]; lateCancel: CheckoutFee[] } {
  return {
    visit: fees.filter(fee => fee.lateFeePence != null || fee.noShowFeePence != null),
    lateCancel: fees.filter(fee => fee.lateCancelFeePence != null),
  };
}

/** What the card is asked for now, in pence: the booking itself, or for a
 *  request (out-of-hours) only the hold. Stripe's form shows this amount in
 *  the Apple Pay sheet; the charge itself is always the server's. */
export function sheetAmountPence(plan: CheckoutHoldPlan, amountDue: number): number {
  if (plan.chargeNowPence > 0) return plan.chargeNowPence;
  if (plan.heldPence > 0) return plan.heldPence;
  return Math.round(amountDue * 100);
}

/** A request (a time outside the provider's usual rules) is held on the card
 *  until they accept; anything else is a booking. A booking from a provider
 *  who doesn't accept automatically is a request too. */
export function isRequestCheckout(plan: CheckoutHoldPlan | null): boolean {
  return plan !== null && plan.requestCount > 0;
}

/** The amount line above Stripe's form: taken now, or only held for a request. */
export function dueNowLine(plan: CheckoutHoldPlan | null, amountDue: number, isDeposit: boolean): { label: string; amount: number } {
  if (plan && plan.chargeNowPence <= 0 && plan.heldPence > 0) {
    return { label: 'Held on your card', amount: plan.heldPence / 100 };
  }
  return { label: isDeposit ? 'Deposit due now' : 'Due now', amount: plan ? plan.chargeNowPence / 100 : amountDue };
}

/** The Booked screen's line about money. */
export function bookedMoneyLine(plan: CheckoutHoldPlan | null, amountDue: number): string {
  if (plan && plan.requestCount > 0 && plan.chargeNowPence <= 0) {
    return `£${(plan.heldPence / 100).toFixed(2)} is held on your card, not taken. You’re only charged if it’s accepted.`;
  }
  const paid = plan ? plan.chargeNowPence / 100 : amountDue;
  return `You’ve paid £${paid.toFixed(2)}.`;
}

/** What the client is told when the card was approved but the checkout
 *  didn't simply book. The web has no notifications, so nothing here says
 *  "we'll let you know" except what the confirmation email really does. */
export function unsettledMessage(outcome: Exclude<SettledCheckout, 'succeeded'> | 'unknown'): {
  title: string;
  body: string;
  canPickAgain: boolean;
} {
  if (outcome === 'refunded') {
    return {
      title: 'Booking not completed',
      body: 'Your time was no longer available by the time your payment went through, so we’ve refunded it in full. It can take 5–10 working days to show on your statement.',
      canPickAgain: true,
    };
  }
  if (outcome === 'not_charged') {
    return {
      title: 'Payment didn’t go through',
      body: 'We couldn’t confirm your booking in time, so the payment was cancelled and you haven’t been charged.',
      canPickAgain: true,
    };
  }
  return {
    title: 'Still confirming your payment',
    body: 'Please don’t pay again. If it goes through, your booking confirmation will arrive by email.',
    canPickAgain: false,
  };
}
