import { readFileSync } from 'fs';
import { join } from 'path';

// Every client gets the same two appointment reminders (2 days before and the
// day before); providers no longer pick. The Automations screen used to offer
// 1h, 3h and 1 week too, which the server never understood, so a provider who
// picked only those silently switched reminders off for their clients.
const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20261126140000_client_reminders_fixed_timing.sql');
const screen = read('src/screens/provider/ProviderAutomationsScreen.tsx');
const emailFn = read('supabase/functions/send-booking-update-email/index.ts');

describe('client reminders are the same for everyone', () => {
  it('rebuilds the live job, guarded, rather than a repo copy', () => {
    expect(migration).toContain("pg_get_functiondef('public.process_client_appointment_reminders()'::regprocedure)");
    expect(migration).toMatch(/IF md5\(v_def\) <> '[0-9a-f]{32}' THEN\s+RAISE EXCEPTION/);
    expect(migration).toMatch(/IF v_count <> 1 THEN\s+RAISE EXCEPTION/);
  });

  it('sends 2 days before and the day before, and stops reading the provider setting', () => {
    expect(migration).toContain("$n$FROM (VALUES ('24h', 1), ('48h', 2)) AS v(timing, days_ahead)$n$");
    expect(migration).toContain("$o$        AND COALESCE(p.automation_settings->'clientReminderTiming', '[\"24h\"]'::jsonb) ? t.timing$o$ || chr(10)");
    expect(migration).toContain("$n$ELSE 'in 2 days' END$n$");
  });

  it('gives providers no reminder setting to change', () => {
    expect(screen).not.toContain('clientReminderTiming');
    expect(screen).not.toContain('pa_client_reminder_timing');
  });

  it('emails only the day-before reminder, whatever the provider once saved', () => {
    expect(emailFn).not.toContain('clientReminderTiming');
    expect(emailFn).toContain('reminderTiming !== EMAILED_REMINDER_TIMING');
  });
});
