import { readFileSync } from 'fs';
import { join } from 'path';
import { noticeChoiceForHours } from '../utils/policyDisplay';

// keep_cancel_notice_in_step() rewrites booking_policies.cancelNotice from
// providers.cancellation_notice_hours. Its hours→choice table must be the same
// one Policies uses to show the window, or the trigger would write a choice the
// screen reads back as a different window.
const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase/migrations/20261113180000_cancel_notice_one_value.sql'),
  'utf8',
);

describe('cancel notice kept as one value', () => {
  it.each([12, 24, 48, 72])('maps %i hours the same way as the Policies screen', (hours) => {
    expect(sql).toContain(`WHEN ${hours} THEN '${noticeChoiceForHours(hours)}'`);
  });

  it('has no choice for 0, which defers to the text, in either place', () => {
    expect(noticeChoiceForHours(0)).toBeNull();
    expect(sql).not.toMatch(/WHEN 0 THEN/);
  });

  it('only ever writes the text from the window, never the window from the text', () => {
    expect(sql).not.toMatch(/NEW\.cancellation_notice_hours\s*:=/);
    expect(sql).toMatch(/NEW\.booking_policies := jsonb_set\(NEW\.booking_policies, '\{cancelNotice\}'/);
  });

  it("leaves link-only providers' own notice alone", () => {
    expect(sql).toMatch(/NEW\.booking_mode IS NOT DISTINCT FROM 'external'/);
  });
});
