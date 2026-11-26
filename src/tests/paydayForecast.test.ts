import { addWorkingDays, clearsOn, nextPayday, upcomingPaydays } from '../features/payments/paydayForecast';
import type { PayoutSchedule } from '../constants/payoutSchedule';
import type { ProviderPayout, ProviderTipEarning } from '../services/providerPaymentService';

// Local dates throughout, as the card shows them. 2026-11-18 is a Wednesday.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const day = (value: Date | null) => value && `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;

const weeklyMonday: PayoutSchedule = { interval: 'weekly', weeklyDays: ['monday'], monthlyDays: [] };

function payout(over: Partial<ProviderPayout>): ProviderPayout {
  return {
    id: 'p1', booking_id: 'b1', payout_amount: 4230, gross_amount: 4700, platform_fee: 470, currency: 'gbp',
    status: 'held', release_after: at(2026, 11, 20).toISOString(), created_at: at(2026, 11, 14).toISOString(),
    refundRequestOpen: false, bankDispute: null,
    booking: { service_name_snapshot: 'Lash Lift', customer_name: 'Amy', booking_date: '2026-11-19', status: 'confirmed', group_booking_id: null },
    ...over,
  };
}

describe('payday forecast', () => {
  it('counts working days, skipping the weekend', () => {
    expect(day(addWorkingDays(at(2026, 11, 20), 3))).toBe('2026-11-25'); // Fri → Wed
    expect(day(addWorkingDays(at(2026, 11, 18), 3))).toBe('2026-11-23'); // Wed → Mon
  });

  it('clears 3 working days after payment, but never before the hold ends', () => {
    expect(day(clearsOn(at(2026, 11, 10), at(2026, 11, 11)))).toBe('2026-11-13');
    expect(day(clearsOn(at(2026, 11, 10), at(2026, 11, 20)))).toBe('2026-11-20');
  });

  it('finds the next payday on each schedule', () => {
    expect(day(nextPayday(at(2026, 11, 18), weeklyMonday))).toBe('2026-11-23');
    expect(day(nextPayday(at(2026, 11, 23), weeklyMonday))).toBe('2026-11-23');
    expect(day(nextPayday(at(2026, 11, 21), { interval: 'daily', weeklyDays: [], monthlyDays: [] }))).toBe('2026-11-23');
    expect(day(nextPayday(at(2026, 11, 18), { interval: 'monthly', weeklyDays: [], monthlyDays: [1, 15] }))).toBe('2026-12-1');
    // 31 means the month's last day.
    expect(day(nextPayday(at(2026, 11, 18), { interval: 'monthly', weeklyDays: [], monthlyDays: [31] }))).toBe('2026-11-30');
    expect(nextPayday(at(2026, 11, 18), { interval: 'manual', weeklyDays: [], monthlyDays: [] })).toBeNull();
  });

  it('groups payments and tips by payday, soonest first, leaving out what has gone or is stuck', () => {
    const tips: ProviderTipEarning[] = [{
      id: 't1', bookingId: 'b1', amountPence: 500, payoutPence: 500, payoutStatus: 'held',
      releaseAfter: at(2026, 11, 20).toISOString(), paidAt: at(2026, 11, 19).toISOString(), serviceName: 'Lash Lift', customerName: 'Priya',
    }];
    const days = upcomingPaydays({
      now: at(2026, 11, 18),
      schedule: weeklyMonday,
      tips,
      payouts: [
        payout({}), // clears Fri 20 → Mon 23
        payout({ id: 'p2', release_after: at(2026, 11, 27).toISOString(), payout_amount: 3570 }), // Mon 30
        payout({ id: 'old', status: 'transferred', created_at: at(2026, 11, 2).toISOString(), release_after: at(2026, 11, 3).toISOString() }), // paid Mon 9
        payout({ id: 'refund', refundRequestOpen: true }),
        payout({ id: 'dispute', bankDispute: { stage: 'open' } as ProviderPayout['bankDispute'] }),
        payout({ id: 'gone', status: 'cancelled' }),
      ],
    });
    expect(days.map(d => d.key)).toEqual(['2026-11-23', '2026-11-30']);
    expect(days[0]!.totalPence).toBe(4230);
    expect(days[0]!.items).toEqual([{ key: 'payout-p1', title: 'Lash Lift', detail: 'Amy', pence: 4230 }]);
    // The tip was paid Thu 19, so it clears Tue 24 and goes the Monday after.
    expect(days[1]!.items.map(i => i.key)).toEqual(['payout-p2', 'tip-t1']);
    expect(days[1]!.totalPence).toBe(4070);
  });

  it('shows at most three paydays', () => {
    const payouts = [0, 7, 14, 21].map(offset => payout({ id: `w${offset}`, release_after: at(2026, 11, 20 + offset).toISOString() }));
    expect(upcomingPaydays({ now: at(2026, 11, 18), schedule: weeklyMonday, tips: [], payouts })).toHaveLength(3);
  });
});
