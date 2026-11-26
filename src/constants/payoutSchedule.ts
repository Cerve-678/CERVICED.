/**
 * How often Stripe pays a provider's balance into their bank, as chosen in
 * Payment settings. Mirrors the whitelist in
 * supabase/functions/_shared/payoutSchedule.ts (parsePayoutScheduleChoice),
 * which the server enforces; change both together. Stripe holds the schedule,
 * so what the app shows is read back from Stripe, and can be something the app
 * doesn't offer (set in Stripe's own dashboard).
 *
 * CERVICED itself always holds a booking payout for 24 hours after the
 * appointment, then releases it to the provider's Stripe balance.
 */
export const PAYOUT_INTERVALS = ['daily', 'weekly', 'monthly'] as const;
export type PayoutInterval = typeof PAYOUT_INTERVALS[number];

export const PAYOUT_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type PayoutWeekday = typeof PAYOUT_WEEKDAYS[number];

/** 31 is "the last day": Stripe moves it to a shorter month's last day. */
export const PAYOUT_MONTH_DAYS = [1, 15, 31] as const;
export type PayoutMonthDay = typeof PAYOUT_MONTH_DAYS[number];

export type PayoutScheduleChoice =
  | { interval: 'daily' }
  | { interval: 'weekly'; weeklyDay: PayoutWeekday }
  | { interval: 'monthly'; monthlyDay: PayoutMonthDay };

/** What Stripe has now (the server's PayoutScheduleView). */
export interface PayoutSchedule {
  interval: PayoutInterval | 'manual' | 'unknown';
  weeklyDays: string[];
  monthlyDays: number[];
}

/** How long CERVICED holds a booking payout after the appointment ends. */
export const PAYOUT_RELEASE_HOURS = 24;

export function payoutIntervalLabel(interval: PayoutInterval): string {
  return interval === 'daily' ? 'Daily' : interval === 'weekly' ? 'Weekly' : 'Monthly';
}

export function payoutWeekdayLabel(day: PayoutWeekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}

export function payoutMonthDayLabel(day: PayoutMonthDay): string {
  return day === 1 ? '1st' : day === 15 ? '15th' : 'Last day';
}

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function ordinal(day: number): string {
  if (day >= 29) return 'last day';
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** "Stripe pays your bank every day." and so on, for step 3 of "From booking to bank". */
export function payoutScheduleSentence(schedule: PayoutSchedule | null): string {
  if (!schedule) return 'Stripe pays your bank on your payout schedule.';
  switch (schedule.interval) {
    case 'daily': return 'Stripe pays your bank every working day.';
    case 'weekly': {
      const days = schedule.weeklyDays.map(day => day.charAt(0).toUpperCase() + day.slice(1));
      return days.length ? `Stripe pays your bank every ${list(days)}.` : 'Stripe pays your bank once a week.';
    }
    case 'monthly': {
      const days = schedule.monthlyDays.map(day => `the ${ordinal(day)}`);
      return days.length ? `Stripe pays your bank on ${list(days)} of each month.` : 'Stripe pays your bank once a month.';
    }
    case 'manual': return 'Your bank payouts are set to manual in Stripe, so nothing is sent until you choose a schedule.';
    default: return 'Stripe pays your bank on your payout schedule.';
  }
}
