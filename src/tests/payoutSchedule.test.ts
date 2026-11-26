import {
  DEFAULT_PAYOUT_SCHEDULE, PAYOUT_MONTH_DAYS as SERVER_MONTH_DAYS, PAYOUT_WEEKDAYS as SERVER_WEEKDAYS,
  getStripePayoutSchedule, parsePayoutScheduleChoice, payoutScheduleForm, readPayoutSchedule, setStripePayoutSchedule,
} from '../../supabase/functions/_shared/payoutSchedule';
import {
  PAYOUT_INTERVALS, PAYOUT_MONTH_DAYS, PAYOUT_WEEKDAYS, payoutMonthDayLabel, payoutScheduleSentence, payoutWeekdayLabel,
} from '../constants/payoutSchedule';

describe('the choices the app offers match what the server accepts', () => {
  it('offers the same intervals, weekdays and month days', () => {
    expect([...PAYOUT_WEEKDAYS]).toEqual([...SERVER_WEEKDAYS]);
    expect([...PAYOUT_MONTH_DAYS]).toEqual([...SERVER_MONTH_DAYS]);
    for (const interval of PAYOUT_INTERVALS) {
      const choice = interval === 'weekly' ? { interval, weeklyDay: 'monday' } : interval === 'monthly' ? { interval, monthlyDay: 1 } : { interval };
      expect(parsePayoutScheduleChoice(choice)).toEqual(choice);
    }
    expect(PAYOUT_WEEKDAYS.map(payoutWeekdayLabel)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(PAYOUT_MONTH_DAYS.map(payoutMonthDayLabel)).toEqual(['1st', '15th', 'Last day']);
  });

  it('starts everyone on monthly, on the 1st', () => {
    expect(DEFAULT_PAYOUT_SCHEDULE).toEqual({ interval: 'monthly', monthlyDay: 1 });
  });

  it('refuses anything else, including manual, weekends and other dates', () => {
    for (const bad of [null, 'daily', {}, { interval: 'manual' }, { interval: 'weekly' }, { interval: 'weekly', weeklyDay: 'saturday' },
      { interval: 'monthly', monthlyDay: 5 }, { interval: 'monthly', monthlyDay: '1' }]) {
      expect(parsePayoutScheduleChoice(bad)).toBeNull();
    }
  });
});

describe('Stripe Balance Settings', () => {
  it('sends only the fields for the chosen interval', () => {
    expect(payoutScheduleForm({ interval: 'daily' }).toString())
      .toBe('payments%5Bpayouts%5D%5Bschedule%5D%5Binterval%5D=daily');
    expect([...payoutScheduleForm({ interval: 'weekly', weeklyDay: 'friday' })]).toEqual([
      ['payments[payouts][schedule][interval]', 'weekly'], ['payments[payouts][schedule][weekly_payout_days][]', 'friday'],
    ]);
    expect([...payoutScheduleForm({ interval: 'monthly', monthlyDay: 31 })]).toEqual([
      ['payments[payouts][schedule][interval]', 'monthly'], ['payments[payouts][schedule][monthly_payout_days][]', '31'],
    ]);
  });

  it('reads what Stripe has, including schedules the app does not offer', () => {
    expect(readPayoutSchedule({ payments: { payouts: { schedule: { interval: 'weekly', weekly_payout_days: ['monday', 'thursday'] } } } }))
      .toEqual({ interval: 'weekly', weeklyDays: ['monday', 'thursday'], monthlyDays: [] });
    expect(readPayoutSchedule({ payments: { payouts: { schedule: { interval: 'manual' } } } }))
      .toEqual({ interval: 'manual', weeklyDays: [], monthlyDays: [] });
    expect(readPayoutSchedule({})).toEqual({ interval: 'unknown', weeklyDays: [], monthlyDays: [] });
  });

  it("targets the provider's own account and throws Stripe's reason when it refuses", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ payments: { payouts: { schedule: { interval: 'monthly', monthly_payout_days: [1] } } } }) };
    }) as unknown as typeof fetch;
    await expect(setStripePayoutSchedule('sk_test', 'acct_1', { interval: 'monthly', monthlyDay: 1 }, ok))
      .resolves.toEqual({ interval: 'monthly', weeklyDays: [], monthlyDays: [1] });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/balance_settings');
    expect(calls[0]!.init.method).toBe('POST');
    expect(headers['Stripe-Account']).toBe('acct_1');
    expect(headers['Authorization']).toBe('Bearer sk_test');

    await getStripePayoutSchedule('sk_test', 'acct_1', ok);
    expect(calls[1]!.init.method).toBe('GET');
    expect(calls[1]!.init.body).toBeUndefined();

    const refused = (async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'No such account' } }) })) as unknown as typeof fetch;
    await expect(getStripePayoutSchedule('sk_test', 'acct_1', refused)).rejects.toThrow('No such account');
  });
});

describe('payoutScheduleSentence', () => {
  it('says when the money reaches the bank in plain words', () => {
    expect(payoutScheduleSentence({ interval: 'daily', weeklyDays: [], monthlyDays: [] })).toBe('Stripe pays your bank every working day.');
    expect(payoutScheduleSentence({ interval: 'weekly', weeklyDays: ['friday'], monthlyDays: [] })).toBe('Stripe pays your bank every Friday.');
    expect(payoutScheduleSentence({ interval: 'weekly', weeklyDays: ['monday', 'wednesday', 'friday'], monthlyDays: [] }))
      .toBe('Stripe pays your bank every Monday, Wednesday and Friday.');
    expect(payoutScheduleSentence({ interval: 'monthly', weeklyDays: [], monthlyDays: [1] })).toBe('Stripe pays your bank on the 1st of each month.');
    expect(payoutScheduleSentence({ interval: 'monthly', weeklyDays: [], monthlyDays: [15, 31] })).toBe('Stripe pays your bank on the 15th and the last day of each month.');
    expect(payoutScheduleSentence({ interval: 'monthly', weeklyDays: [], monthlyDays: [22] })).toBe('Stripe pays your bank on the 22nd of each month.');
    expect(payoutScheduleSentence(null)).toBe('Stripe pays your bank on your payout schedule.');
  });
});
