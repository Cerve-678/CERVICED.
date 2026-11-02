import { readFileSync } from 'fs';
import { join } from 'path';

// "Has space again" goes to bell followers, so a false one is a false promise
// to a client. Read from the migration that sets the rules.
const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261102100000_openings_alert_short_horizon.sql'),
  'utf8',
);
const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.process_follow_openings_alerts'));

describe('the "has space again" alert', () => {
  it('says nothing with under a week left to book, before it looks at slots', () => {
    expect(fn).toContain('CONTINUE WHEN v_horizon < 7;');
    expect(fn.indexOf('CONTINUE WHEN v_horizon < 7;')).toBeLessThan(fn.indexOf('get_services_open_within('));
  });

  it('leaves a blocked-out diary alone rather than calling it full or open', () => {
    const skip = fn.indexOf('CONTINUE WHEN NOT v_open AND NOT EXISTS (');
    expect(skip).toBeGreaterThan(fn.indexOf('get_services_open_within('));
    expect(skip).toBeLessThan(fn.indexOf('SELECT s.is_fully_booked, s.last_alert_at'));
  });

  it('still only alerts on a change from full to open', () => {
    expect(fn).toContain('IF v_was_full AND v_open THEN');
  });

  it('refuses to apply over a newer definition', () => {
    expect(MIGRATION.match(/rebuild from live/g)).toHaveLength(1);
  });
});
