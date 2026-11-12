// How often Stripe pays a provider's Stripe balance into their bank: the
// choice a provider makes in Payment settings (daily, weekly on a weekday, or
// monthly on the 1st, 15th or last day). Stripe holds the schedule itself,
// through the Balance Settings API on the provider's connected account, so the
// app reads it from Stripe rather than keeping a copy that could go stale.
//
// Separate from CERVICED's own hold: a booking payout always waits a fixed 24
// hours after the appointment before it is released to the provider's Stripe
// balance (create_held_payout_on_finalize). This schedule only decides when
// Stripe then sends that balance to the bank.
//
// Import-free (fetch is passed in) so src/tests can pin it; the Deno functions
// apply it.

export const PAYOUT_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type PayoutWeekday = typeof PAYOUT_WEEKDAYS[number];

/** 31 is "the last day": Stripe moves a 29th–31st payout to a shorter month's last day. */
export const PAYOUT_MONTH_DAYS = [1, 15, 31] as const;
export type PayoutMonthDay = typeof PAYOUT_MONTH_DAYS[number];

/** A schedule a provider can choose. */
export type PayoutScheduleChoice =
  | { interval: 'daily' }
  | { interval: 'weekly'; weeklyDay: PayoutWeekday }
  | { interval: 'monthly'; monthlyDay: PayoutMonthDay };

/** Every provider starts here (user decision 2026-11-10). */
export const DEFAULT_PAYOUT_SCHEDULE: PayoutScheduleChoice = { interval: 'monthly', monthlyDay: 1 };

/**
 * What Stripe has now. It can hold things the app never offers (set in
 * Stripe's own dashboard, or before this existed), so it is read as it is.
 */
export interface PayoutScheduleView {
  interval: 'daily' | 'weekly' | 'monthly' | 'manual' | 'unknown';
  weeklyDays: string[];
  monthlyDays: number[];
}

/** A choice sent by the app, or null if it isn't one the app offers. */
export function parsePayoutScheduleChoice(value: unknown): PayoutScheduleChoice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw['interval'] === 'daily') return { interval: 'daily' };
  if (raw['interval'] === 'weekly') {
    const day = raw['weeklyDay'];
    return (PAYOUT_WEEKDAYS as readonly unknown[]).includes(day) ? { interval: 'weekly', weeklyDay: day as PayoutWeekday } : null;
  }
  if (raw['interval'] === 'monthly') {
    const day = raw['monthlyDay'];
    return (PAYOUT_MONTH_DAYS as readonly unknown[]).includes(day) ? { interval: 'monthly', monthlyDay: day as PayoutMonthDay } : null;
  }
  return null;
}

/** The Balance Settings form fields for a choice. */
export function payoutScheduleForm(choice: PayoutScheduleChoice): URLSearchParams {
  const form = new URLSearchParams();
  form.append('payments[payouts][schedule][interval]', choice.interval);
  if (choice.interval === 'weekly') form.append('payments[payouts][schedule][weekly_payout_days][]', choice.weeklyDay);
  if (choice.interval === 'monthly') form.append('payments[payouts][schedule][monthly_payout_days][]', String(choice.monthlyDay));
  return form;
}

/** Reads the schedule out of a Balance Settings response. */
export function readPayoutSchedule(body: unknown): PayoutScheduleView {
  const schedule = (body as { payments?: { payouts?: { schedule?: Record<string, unknown> } } } | null)
    ?.payments?.payouts?.schedule;
  const interval = schedule?.['interval'];
  const known = interval === 'daily' || interval === 'weekly' || interval === 'monthly' || interval === 'manual';
  const weekly = schedule?.['weekly_payout_days'];
  const monthly = schedule?.['monthly_payout_days'];
  return {
    interval: known ? interval : 'unknown',
    weeklyDays: Array.isArray(weekly) ? weekly.filter((d): d is string => typeof d === 'string') : [],
    monthlyDays: Array.isArray(monthly) ? monthly.filter((d): d is number => typeof d === 'number') : [],
  };
}

// Balance Settings is GA from 2025-09-30.clover; this matches the version the
// connected accounts are created with (createConnectedAccount.ts).
const STRIPE_VERSION = '2026-08-26.dahlia';
const BALANCE_SETTINGS_URL = 'https://api.stripe.com/v1/balance_settings';

async function balanceSettings(
  secret: string, accountId: string, request: typeof fetch, form?: URLSearchParams,
): Promise<PayoutScheduleView> {
  const response = await request(BALANCE_SETTINGS_URL, {
    method: form ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': STRIPE_VERSION,
      'Stripe-Account': accountId,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(form ? { body: form.toString() } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Stripe balance settings ${form ? 'update' : 'read'} failed for ${accountId}: ${message}`);
  }
  return readPayoutSchedule(body);
}

export function getStripePayoutSchedule(secret: string, accountId: string, request: typeof fetch = fetch): Promise<PayoutScheduleView> {
  return balanceSettings(secret, accountId, request);
}

export function setStripePayoutSchedule(
  secret: string, accountId: string, choice: PayoutScheduleChoice, request: typeof fetch = fetch,
): Promise<PayoutScheduleView> {
  return balanceSettings(secret, accountId, request, payoutScheduleForm(choice));
}
