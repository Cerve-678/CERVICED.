import { readFileSync } from 'fs';
import { join } from 'path';

// When a time a provider offers has just been taken, the provider is told
// which one ("20 Nov at 2:30pm is no longer free"). The message used to call
// format_notification_time(date, text) and one-argument to_char(time), neither
// of which exists, so building it failed and the provider saw a generic error.
describe('reschedule offer: a taken time is named', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', 'supabase/migrations/20261116090000_reschedule_taken_time_message.sql'),
    'utf8',
  ).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

  it('builds the message only from functions that exist', () => {
    expect(sql).toContain("TO_CHAR(v_date, 'FMDD Mon'), public.format_notification_time(v_time::TIME)");
    expect(sql).not.toMatch(/format_notification_time\(\s*v_date/);
    expect(sql).not.toMatch(/to_char\(\s*[a-z_.:]+\s*\)/i);
  });

  it('still raises it as P0001 so the screen shows it as written', () => {
    const raise = sql.slice(sql.indexOf('is no longer free'));
    expect(raise.slice(0, 200)).toContain("ERRCODE = 'P0001'");
  });
});
