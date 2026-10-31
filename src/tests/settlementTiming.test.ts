import { readFileSync } from 'fs';
import { join } from 'path';
import { describeSettlementTiming } from '../features/bookings/paymentPresentation';
import { cancellationNoticeHours } from '../utils/policyDisplay';

describe('cancellationNoticeHours', () => {
  it('prefers the explicit column, then the policy text, else no window', () => {
    expect(cancellationNoticeHours(12, { cancelNotice: '48h' })).toBe(12);
    expect(cancellationNoticeHours(null, { cancelNotice: '48h' })).toBe(48);
    expect(cancellationNoticeHours(0, { cancelNotice: '24h' })).toBe(24);
    expect(cancellationNoticeHours(null, { cancelNotice: 'none' })).toBe(0);
    expect(cancellationNoticeHours(undefined, null)).toBe(0);
  });
});

describe('describeSettlementTiming', () => {
  it('says how long before, and the notice it fell inside', () => {
    expect(describeSettlementTiming(6.4, 24)).toBe('Cancelled 6 hours before, inside your 24-hour notice.');
    expect(describeSettlementTiming(1, 24)).toBe('Cancelled 1 hour before, inside your 24-hour notice.');
  });

  it('switches to minutes inside the last hour', () => {
    expect(describeSettlementTiming(0.25, 24)).toBe('Cancelled 15 minutes before, inside your 24-hour notice.');
    expect(describeSettlementTiming(0.001, 24)).toBe('Cancelled 1 minute before, inside your 24-hour notice.');
  });

  it('handles a cancel after the start, no notice window, and missing timing', () => {
    expect(describeSettlementTiming(-0.5, 24)).toBe('Cancelled after the appointment start time.');
    expect(describeSettlementTiming(30, 0)).toBe('Cancelled 30 hours before.');
    expect(describeSettlementTiming(null, 24)).toBeNull();
  });

  it('says the booking was moved inside the notice, whatever the cancel timing', () => {
    expect(describeSettlementTiming(120, 24, true)).toBe('Moved inside your 24-hour notice, then cancelled.');
    expect(describeSettlementTiming(null, 0, true)).toBe('Moved inside your notice period, then cancelled.');
  });
});

// The server half of the rule lives in Deno and SQL, outside jest's reach, so
// pin the pieces that must agree: the refund function reads the column the
// migration adds, and only a client's own late request sets it.
describe('rescheduling inside the cancellation window', () => {
  const root = join(__dirname, '..', '..');
  const fn = readFileSync(join(root, 'supabase/functions/apply-cancellation-refund/index.ts'), 'utf8');
  const sql = readFileSync(join(root, 'supabase/migrations/20261031200000_late_reschedule_keeps_cancel_charge.sql'), 'utf8');

  it('settles a late-moved booking as a late cancel', () => {
    expect(fn).toMatch(/late_reschedule_from/);
    expect(fn).toMatch(/const isLateCancel = movedLate \|\|/);
  });

  it('only stamps the booking for a request the client made inside the window', () => {
    expect(sql).toMatch(/requested_by = 'user' AND requested_inside_cancel_window/);
    // Both confirm paths stamp it, so a group booking can't be moved around it.
    expect(sql.match(/late_reschedule_from = CASE/g)).toHaveLength(2);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_group_reschedule/);
  });

  it('covers only bookings made after the rule went live, and lets a provider-proposed move clear it', () => {
    expect(sql).toMatch(/v_booking\.created_at >= public\.late_reschedule_rule_starts_at\(\)/);
    expect(sql.match(/WHEN v_by_provider THEN NULL/g)).toHaveLength(2);
    expect(sql).toMatch(/AS late_reschedule_rule_applies/);
    expect(sql).toMatch(/GRANT SELECT \(late_reschedule_from\) ON public\.bookings TO authenticated/);
    expect(sql).toMatch(/b\.late_reschedule_from,\s+\(b\.created_at/);
  });
});
