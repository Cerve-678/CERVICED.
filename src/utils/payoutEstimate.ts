/**
 * Turns one booking payment's Stripe dates into what the provider is told:
 * when it's in their Stripe balance, and roughly when it reaches their bank.
 *
 * Stripe holds a UK card payment ~3 working days from when the CLIENT paid,
 * and a transfer made from that payment inherits the same date. So a booking
 * paid a week ahead is in Stripe soon after release, while a same-day one
 * waits. The bank date then follows the provider's payout schedule, plus one
 * working day for the bank transfer. Weekends are skipped; UK bank holidays
 * aren't known here, which is why the copy says "around".
 */
export interface PayoutSchedule {
  interval: string;
  weeklyAnchor: string | null;
  monthlyAnchor: number | null;
}

export interface PaymentEstimateInput {
  status: string;
  releaseAfter: string;
  /** Unix seconds; null when Stripe has no date for it. */
  availableOn: number | null;
  schedule: PayoutSchedule | null;
}

export interface PaymentArrival {
  /** When the share is (or will be) in the provider's Stripe balance. */
  inStripe: Date;
  /** Roughly when it reaches the bank; null on a manual schedule or when unknown. */
  inBank: Date | null;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
function nextBusinessDay(d: Date): Date {
  let next = new Date(d.getTime() + DAY_MS);
  while (isWeekend(next)) next = new Date(next.getTime() + DAY_MS);
  return next;
}

/** The day Stripe would start a payout that includes money available on `day`. */
function payoutDay(day: Date, schedule: PayoutSchedule): Date | null {
  if (schedule.interval === 'daily') return day;
  if (schedule.interval === 'weekly') {
    const anchor = WEEKDAYS.indexOf(schedule.weeklyAnchor ?? 'monday');
    if (anchor < 0) return null;
    return new Date(day.getTime() + ((anchor - day.getUTCDay() + 7) % 7) * DAY_MS);
  }
  if (schedule.interval === 'monthly') {
    const anchor = schedule.monthlyAnchor ?? 1;
    const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let y = day.getUTCFullYear();
    let m = day.getUTCMonth();
    if (day.getUTCDate() > Math.min(anchor, lastDay(y, m))) { m += 1; if (m > 11) { m = 0; y += 1; } }
    return new Date(Date.UTC(y, m, Math.min(anchor, lastDay(y, m))));
  }
  return null; // manual: the provider pays out from Stripe themselves
}

export function estimatePaymentArrival(input: PaymentEstimateInput): PaymentArrival | null {
  const release = new Date(input.releaseAfter);
  const fromStripe = input.availableOn === null ? null : new Date(input.availableOn * 1000);
  let inStripe: Date;
  if (input.status === 'held') {
    // Our hold has to end first; Stripe's date can only push it later.
    inStripe = fromStripe && fromStripe > release ? fromStripe : release;
  } else if (input.status === 'transferred' && fromStripe) {
    inStripe = fromStripe;
  } else {
    return null;
  }
  let day = startOfUtcDay(inStripe);
  while (isWeekend(day)) day = new Date(day.getTime() + DAY_MS);
  const start = input.schedule ? payoutDay(day, input.schedule) : null;
  return { inStripe, inBank: start ? nextBusinessDay(start) : null };
}

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The sentence shown on an opened booking payment. */
export function paymentArrivalSentence(arrival: PaymentArrival, now: Date): string {
  const stripeDone = arrival.inStripe <= now;
  const stripePart = stripeDone
    ? `In your Stripe balance since ${shortDate(arrival.inStripe)}.`
    : `In your Stripe balance from ${shortDate(arrival.inStripe)}.`;
  if (!arrival.inBank) return `${stripePart} You choose when to pay it out from Stripe.`;
  if (arrival.inBank < startOfUtcDay(now)) return `${stripePart} Expected in your bank around ${shortDate(arrival.inBank)}; see Payouts for the bank transfer it went in.`;
  return `${stripePart} Expected in your bank around ${shortDate(arrival.inBank)}.`;
}
