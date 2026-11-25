import { buildCheckoutIntentItem } from '../features/cart/checkoutIntent';
import type { CheckoutFee, CheckoutHoldPlan } from '../services/databaseService';
import type { WebBookingChoice } from '../web/webBooking';
import {
  bookedMoneyLine,
  depositIsNonRefundable,
  dueNowLine,
  feeGroups,
  webPayButtonLabel,
  isRequestCheckout,
  serviceNeedsSafetyAck,
  sheetAmountPence,
  unsettledMessage,
  webCheckoutItem,
} from '../web/webCheckout';

const service: WebBookingChoice['service'] = {
  id: 1,
  dbId: 'service-uuid',
  name: 'Classic Lash Set',
  price: 45,
  duration: '1h 30m',
  description: '',
  image: null,
};

const choice: WebBookingChoice = {
  service,
  result: {
    selectedAddOns: [{ id: 7, name: 'Lash bath', price: 5.5 }],
    date: '2026-12-03',
    time: '14:30',
    notes: 'First time',
    isDepositOnly: true,
    policySnapshot: { depositMode: 'deposit_required', depositAmount: '20' },
  },
};

const plan = (overrides: Partial<CheckoutHoldPlan> = {}): CheckoutHoldPlan => ({
  chargeNowPence: 1199, heldPence: 0, requestCount: 0, bookingCount: 1, ...overrides,
});

describe('buildCheckoutIntentItem', () => {
  const base = {
    providerId: 'provider-uuid', serviceId: 'service-uuid', date: '2026-12-03', time: '14:30',
    addOnIds: [7], useDeposit: false, notes: undefined, agreed: true, policySnapshot: undefined,
  };

  it('sends the one tick as both the policy agreement and the safety ack', () => {
    const item = buildCheckoutIntentItem(base);
    expect(item).toEqual({
      provider_id: 'provider-uuid', service_id: 'service-uuid', booking_date: '2026-12-03', booking_time: '14:30',
      add_on_ids: ['7'], use_deposit: false, safety_ack: true, policy_accepted: true, policy_snapshot: null,
    });
  });

  it('carries a mobile address only when there is one, and the out-of-hours ack with its flag', () => {
    expect(buildCheckoutIntentItem({ ...base, mobileAddress: { address: '  ', area: null } })).not.toHaveProperty('client_address');
    expect(buildCheckoutIntentItem({ ...base, mobileAddress: { address: ' 1 High St ', area: 'Leeds' }, emergency: true }))
      .toMatchObject({ client_address: '1 High St', client_area: 'Leeds', emergency: true, emergency_ack: true });
    expect(buildCheckoutIntentItem({ ...base, emergency: false })).not.toHaveProperty('emergency');
  });
});

describe('webCheckoutItem', () => {
  it('sends the booking sheet’s choices, the deposit choice and the frozen policy', () => {
    expect(webCheckoutItem({ providerId: 'provider-uuid', choice, agreed: true, mobileAddress: null })).toEqual({
      provider_id: 'provider-uuid', service_id: 'service-uuid', booking_date: '2026-12-03', booking_time: '14:30',
      add_on_ids: ['7'], use_deposit: true, notes: 'First time', safety_ack: true, policy_accepted: true,
      policy_snapshot: { depositMode: 'deposit_required', depositAmount: '20' },
    });
  });

  it('sends the promo code the booking sheet applied, so the server charges the discounted price', () => {
    const item = webCheckoutItem({
      providerId: 'p', agreed: true, mobileAddress: null,
      choice: { ...choice, result: { ...choice.result, promoCode: 'WINTER10' } },
    });
    expect(item.promo_code).toBe('WINTER10');
    expect(webCheckoutItem({ providerId: 'p', agreed: true, mobileAddress: null, choice })).not.toHaveProperty('promo_code');
  });

  it('adds a mobile provider’s address and an out-of-hours request', () => {
    const item = webCheckoutItem({
      providerId: 'p', agreed: true, mobileAddress: '1 High St',
      choice: { ...choice, result: { ...choice.result, emergencyRequest: { acceptedAt: 'x' } as never } },
    });
    expect(item).toMatchObject({ client_address: '1 High St', client_area: null, emergency: true, emergency_ack: true });
  });
});

describe('the review notices', () => {
  it('asks for the safety ack when the provider flagged a patch test or pregnancy', () => {
    expect(serviceNeedsSafetyAck(service)).toBe(false);
    expect(serviceNeedsSafetyAck({ ...service, patchTestRequired: true })).toBe(true);
    expect(serviceNeedsSafetyAck({ ...service, isPregnancySafe: false })).toBe(true);
    expect(serviceNeedsSafetyAck({ ...service, isPregnancySafe: true })).toBe(false);
  });

  it('warns about a non-refundable deposit only while a deposit is offered', () => {
    expect(depositIsNonRefundable(choice)).toBe(false);
    const nonRefundable = { ...choice, result: { ...choice.result, policySnapshot: { ...choice.result.policySnapshot, depositNonRefundable: true } } };
    expect(depositIsNonRefundable(nonRefundable)).toBe(true);
    const fullOnly = { ...choice, result: { ...choice.result, policySnapshot: { depositMode: 'full_only', depositNonRefundable: true } } };
    expect(depositIsNonRefundable(fullOnly)).toBe(false);
  });
});

describe('feeGroups', () => {
  const fee = (overrides: Partial<CheckoutFee>): CheckoutFee => ({
    providerId: 'p', providerName: 'Lou', lateFeePence: null, noShowFeePence: null, graceMinutes: 10,
    lateCancelFeePence: null, lateCancelDepositPence: null, cancelNoticeHours: 24, ...overrides,
  });

  it('splits the late / no-show fees from the late cancellation charge', () => {
    const late = fee({ lateFeePence: 500 });
    const cancel = fee({ providerId: 'q', lateCancelFeePence: 1000, lateCancelDepositPence: 1000 });
    expect(feeGroups([late, cancel])).toEqual({ visit: [late], lateCancel: [cancel] });
    expect(feeGroups([])).toEqual({ visit: [], lateCancel: [] });
  });
});

describe('amounts', () => {
  it('asks the card for the booking, or only the hold for a request', () => {
    expect(sheetAmountPence(plan(), 11.99)).toBe(1199);
    expect(sheetAmountPence(plan({ chargeNowPence: 0, heldPence: 4500, requestCount: 1 }), 45)).toBe(4500);
    expect(sheetAmountPence(plan({ chargeNowPence: 0 }), 11.99)).toBe(1199);
  });

  it('says what was paid, or that a request is only held', () => {
    expect(bookedMoneyLine(plan(), 11.99)).toBe('You’ve paid £11.99.');
    expect(bookedMoneyLine(null, 11.99)).toBe('You’ve paid £11.99.');
    expect(bookedMoneyLine(plan({ chargeNowPence: 0, heldPence: 4500, requestCount: 1 }), 45))
      .toBe('£45.00 is held on your card, not taken. You’re only charged if it’s accepted.');
  });
});

describe('unsettledMessage', () => {
  it('offers another time after a refund or an uncharged payment, but not while still confirming', () => {
    expect(unsettledMessage('refunded').canPickAgain).toBe(true);
    expect(unsettledMessage('not_charged').canPickAgain).toBe(true);
    const unknown = unsettledMessage('unknown');
    expect(unknown.canPickAgain).toBe(false);
    expect(unknown.body).toContain('don’t pay again');
  });
});

describe('request or booking', () => {
  const request = plan({ chargeNowPence: 0, heldPence: 4500, requestCount: 1 });

  it('calls it a request only when the card is held for one', () => {
    expect(isRequestCheckout(request)).toBe(true);
    expect(isRequestCheckout(plan())).toBe(false);
    expect(isRequestCheckout(null)).toBe(false);
  });

  it('says a request’s money is held, not due', () => {
    expect(dueNowLine(request, 45, false)).toEqual({ label: 'Held on your card', amount: 45 });
    expect(dueNowLine(plan(), 11.99, true)).toEqual({ label: 'Deposit due now', amount: 11.99 });
    expect(dueNowLine(null, 30, false)).toEqual({ label: 'Due now', amount: 30 });
  });
});

describe('webPayButtonLabel', () => {
  it('says a request is sent, with the money only held', () => {
    expect(webPayButtonLabel(plan({ chargeNowPence: 0, heldPence: 6865, requestCount: 1 }), 68.65))
      .toBe('Send request · hold £68.65');
    expect(webPayButtonLabel(plan(), 11.99)).toBe('Pay £11.99');
  });
});
