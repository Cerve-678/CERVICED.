import { readFileSync } from 'fs';
import { join } from 'path';

// The day-before reminder used to tell every client "Please arrive 10 minutes
// early", whatever their provider had written. This pins the migration that
// swaps that line for the provider's own note, and the copy that promises it.
const migration = readFileSync(
  join(__dirname, '../../supabase/migrations/20261103100000_reminder_uses_provider_booking_note.sql'),
  'utf8',
);

describe('day-before reminder uses the provider note', () => {
  it('rebuilds the live function rather than a repo copy', () => {
    expect(migration).toContain("pg_get_functiondef('public.process_client_appointment_reminders()'::regprocedure)");
    expect(migration).toContain('EXECUTE replace(v_def, v_old, v_new)');
  });

  it('stops if the fixed line is not there exactly once', () => {
    expect(migration).toMatch(/IF v_count <> 1 THEN\s+RAISE EXCEPTION/);
  });

  it("reads the booking's own snapshot and adds nothing when it's blank", () => {
    expect(migration).toContain('bk.booking_instructions');
    expect(migration).toContain('WHERE bk.id = r.booking_id');
    expect(migration).toContain("NULLIF(btrim(bk.booking_instructions), '') IS NOT NULL");
    expect(migration).toMatch(/\), ''\)\$new\$/);
  });

  it('tells providers about the reminder in both editors', () => {
    for (const screen of ['InfoRegScreen.tsx', 'PoliciesScreen.tsx']) {
      const source = readFileSync(join(__dirname, '../screens/provider', screen), 'utf8');
      expect(source).toContain('and in the reminder the day before');
    }
  });
});
