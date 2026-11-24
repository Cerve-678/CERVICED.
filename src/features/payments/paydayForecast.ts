// Which upcoming payday each booking payment (and tip) should land in, for the
// "Your paydays" card on My Profile. Pure, so it can be tested on its own.
//
// An estimate, and labelled "Expected" wherever it's shown: Stripe doesn't
// say which bank payout a balance will go out in until it creates one. The
// path it follows: CERVICED holds the payment until release_after (24 hours
// after the appointment), the money clears about 3 working days after the
// client paid, and Stripe sends cleared money on the provider's next payday.
// Bank holidays aren't counted, so a date can slip by a day around them.
import type { PayoutSchedule } from '../../constants/payoutSchedule';
import type { ProviderPayout, ProviderTipEarning } from '../../services/providerPaymentService';
import { tipPence } from './bookingPaymentTimeline';

/** Matches "usually about 3 working days after the client paid" on Payments. */
export const CLEARING_WORKING_DAYS = 3;

export interface PaydayItem {
  key: string;
  title: string;
  /** The client's name, or null. */
  detail: string | null;
  pence: number;
}

export interface Payday {
  /** YYYY-MM-DD, local. */
  key: string;
  date: Date;
  totalPence: number;
  items: PaydayItem[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

const isWeekend = (value: Date) => value.getDay() === 0 || value.getDay() === 6;

export function addWorkingDays(value: Date, days: number): Date {
  let day = startOfDay(value);
  let left = days;
  while (left > 0) {
    day = addDays(day, 1);
    if (!isWeekend(day)) left -= 1;
  }
  return day;
}

/** The day the money should be cleared: 3 working days after the client
 *  paid, and never before CERVICED releases it. */
export function clearsOn(paidAt: Date, releaseAt: Date): Date {
  const cleared = addWorkingDays(paidAt, CLEARING_WORKING_DAYS);
  const released = startOfDay(releaseAt);
  return cleared.getTime() >= released.getTime() ? cleared : released;
}

function lastDayOfMonth(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

/** The first payday on or after `day`, or null when the schedule doesn't
 *  give one (manual, or something set in Stripe the app can't read). */
export function nextPayday(day: Date, schedule: PayoutSchedule): Date | null {
  const from = startOfDay(day);
  const isPayday = (candidate: Date): boolean => {
    switch (schedule.interval) {
      case 'daily': return !isWeekend(candidate);
      case 'weekly': return schedule.weeklyDays.includes(WEEKDAYS[candidate.getDay()]!);
      case 'monthly': return schedule.monthlyDays.some(d => Math.min(d, lastDayOfMonth(candidate)) === candidate.getDate());
      default: return false;
    }
  };
  // Two months covers every monthly schedule.
  for (let i = 0; i <= 62; i += 1) {
    const candidate = addDays(from, i);
    if (isPayday(candidate)) return candidate;
  }
  return null;
}

function ymd(value: Date): string {
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${m}-${d}`;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A payout still on its normal way to the bank. One with a refund request
 *  or bank dispute open, or that failed or ended, has no payday to forecast. */
function onItsWay(row: ProviderPayout): boolean {
  if (row.status !== 'held' && row.status !== 'transferred') return false;
  if (row.status === 'held' && row.refundRequestOpen) return false;
  const dispute = row.bankDispute?.stage;
  return !dispute || dispute === 'won';
}

/** The next `limit` paydays from today, each with what's expected in it. */
export function upcomingPaydays(input: {
  payouts: readonly ProviderPayout[];
  tips: readonly ProviderTipEarning[];
  schedule: PayoutSchedule;
  now: Date;
  limit?: number;
}): Payday[] {
  const today = startOfDay(input.now);
  const byDay = new Map<string, Payday>();
  const place = (paidAt: Date | null, releaseAt: Date | null, item: PaydayItem) => {
    if (!paidAt || !releaseAt || item.pence <= 0) return;
    const payday = nextPayday(clearsOn(paidAt, releaseAt), input.schedule);
    // Before today: it has already gone to the bank.
    if (!payday || payday.getTime() < today.getTime()) return;
    const key = ymd(payday);
    const entry = byDay.get(key) ?? { key, date: payday, totalPence: 0, items: [] };
    entry.items.push(item);
    entry.totalPence += item.pence;
    byDay.set(key, entry);
  };

  for (const row of input.payouts) {
    if (!onItsWay(row)) continue;
    place(validDate(row.created_at), validDate(row.release_after), {
      key: `payout-${row.id}`,
      title: row.booking?.service_name_snapshot || 'Booking',
      detail: row.booking?.customer_name || null,
      pence: Number(row.payout_amount),
    });
  }
  for (const tip of input.tips) {
    if (tip.payoutStatus === 'failed' || tip.payoutStatus === 'cancelled' || tip.payoutStatus === 'reversed') continue;
    place(validDate(tip.paidAt), validDate(tip.releaseAfter) ?? validDate(tip.paidAt), {
      key: `tip-${tip.id}`,
      title: 'Tip',
      detail: tip.customerName || null,
      pence: tipPence(tip),
    });
  }

  return [...byDay.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, input.limit ?? 3);
}

/** "Mon 24 Nov" */
export function paydayLabel(value: Date): string {
  return value.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
