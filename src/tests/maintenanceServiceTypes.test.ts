import fs from 'fs';
import path from 'path';
import { MAINTENANCE_SERVICE_TYPES } from '../constants/maintenanceServiceTypes';

/**
 * Source contracts for the server half of Beauty Maintenance. The SQL can't be
 * executed here, so each assertion pins a rule that tsc and the behavioural
 * suites are blind to — the same blind spot that let notifications_type_check
 * reject every insert while both were green (memory: new-notification-type-is-four-places).
 */
const migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const readMigration = (file: string): string => fs.readFileSync(path.join(migrationsDir, file), 'utf8');
const migration = readMigration('20261018180000_beauty_maintenance.sql');
const moreTypes = readMigration('20261019120000_maintenance_more_types_and_notes.sql');

// The live table is whatever the newest seeding migration restated, so that's
// the copy the app table must match.
const SEED = 'INSERT INTO public.maintenance_service_types';
const latestSeed = fs.readdirSync(migrationsDir)
  .filter(f => /^\d{14}_.*\.sql$/.test(f))
  .sort()
  .map(readMigration)
  .filter(sql => sql.includes(SEED))
  .pop()!;
const fn = (name: string): string => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return migration.slice(start, migration.indexOf('$function$;', start));
};

describe('maintenance_service_types seed matches the app table', () => {
  it('has the same keys, categories, weeks and keywords, in order', () => {
    const rows = [...latestSeed.matchAll(
      /\('([a-z_]+)',\s+'([A-Z]+)',\s+(\d+),\s+ARRAY\[([^\]]*)\]::text\[\],\s+(\d+)\)/g,
    )].map(m => ({
      key: m[1],
      searchCategory: m[2],
      defaultWeeks: Number(m[3]),
      keywords: m[4]!.trim() ? m[4]!.split(',').map(k => k.trim().replace(/^'|'$/g, '')) : [],
      sortOrder: Number(m[5]),
    }));
    expect(rows.map(({ sortOrder, ...r }) => r)).toEqual(
      MAINTENANCE_SERVICE_TYPES.map(({ key, searchCategory, defaultWeeks, keywords }) =>
        ({ key, searchCategory, defaultWeeks, keywords: [...keywords] })),
    );
    expect(rows.map(r => r.sortOrder)).toEqual(rows.map((_, i) => i + 1));
  });
});

describe('maintenance_service_types restatement', () => {
  it('is the newest seed, and upserts so a re-run or an old row is corrected in place', () => {
    expect(latestSeed).toBe(moreTypes);
    expect(moreTypes).toMatch(/ON CONFLICT \(key\) DO UPDATE SET[\s\S]*sort_order\s+= EXCLUDED\.sort_order/);
  });

  it('puts a type that must win a keyword tie ahead of the one it beats', () => {
    const keys = MAINTENANCE_SERVICE_TYPES.map(t => t.key);
    expect(keys.indexOf('pedicure')).toBeLessThan(keys.indexOf('gel_nails'));
    expect(keys.indexOf('waxing')).toBeLessThan(keys.indexOf('facial'));
    expect(keys.indexOf('brow_lamination')).toBeLessThan(keys.indexOf('brow_tint'));
  });
});

describe('maintenance note and last-done grants', () => {
  it('adds a capped, owner-only note and lets clients set it and last_done_on', () => {
    expect(moreTypes).toContain('CHECK (note IS NULL OR char_length(note) <= 200)');
    expect(moreTypes).toContain('GRANT INSERT (last_done_on, note) ON public.maintenance_items TO authenticated;');
    expect(moreTypes).toContain('GRANT UPDATE (note) ON public.maintenance_items TO authenticated;');
    // Never widens what a client can forge.
    expect(moreTypes).not.toMatch(/GRANT (INSERT|UPDATE) \([^)]*(origin|source_booking_id|due_push_count)/);
    expect(moreTypes).not.toMatch(/CREATE POLICY|USING\s*\(\s*true/i);
  });
});

describe('beauty maintenance migration contracts', () => {
  it('widens notifications_type_check with both new types', () => {
    const check = migration.slice(migration.indexOf('ADD CONSTRAINT notifications_type_check'));
    expect(check).toContain("'maintenance_due'::text");
    expect(check).toContain("'aftercare_available'::text");
  });

  it('keeps a client-edited interval and only resets the due date on refresh', () => {
    const body = fn('handle_booking_completed_maintenance');
    expect(body).toMatch(/repeat_weeks\s+= CASE WHEN public\.maintenance_items\.interval_edited\s+THEN public\.maintenance_items\.repeat_weeks/);
    expect(body).toContain('due_on            = EXCLUDED.last_done_on + 7 *');
    expect(body).toContain('public.maintenance_items.last_done_on <= EXCLUDED.last_done_on');
  });

  it('never lets the completion trigger roll back the booking', () => {
    const body = fn('handle_booking_completed_maintenance');
    expect(body.match(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/g)).toHaveLength(2);
    expect(body).toContain('v_provider_user = NEW.user_id');
    expect(body).toContain('NEW.service_id IS NULL');
  });

  it('pushes at most twice per item, only for opted-in clients, silent while booked', () => {
    const body = fn('process_maintenance_reminders');
    expect(migration).toContain('CHECK (due_push_count BETWEEN 0 AND 2)');
    expect(body).toContain("COALESCE(u.notification_preferences->>'maintenanceReminders', 'false') = 'true'");
    // The opt-in is the one user-facing control; users.reminder_enabled has no UI.
    expect(body).not.toContain('reminder_enabled');
    expect(body).toContain("b.status IN ('pending', 'confirmed', 'in_progress')");
    expect(body).toContain("DELETE FROM public.maintenance_items WHERE kind = 'event' AND event_on < CURRENT_DATE");
  });

  it('keeps every push body generic and in one place', () => {
    expect(fn('maintenance_notification_copy')).toContain("'You have something due. Open CERVICED to see it.'");
    // Inserts take their title/message from the copy function, never a literal.
    for (const name of ['process_maintenance_reminders', 'handle_booking_completed_maintenance']) {
      expect(fn(name)).toMatch(/v_copy\.title, v_copy\.message/);
    }
  });

  it('lets the settings upsert through: user_id is in the UPDATE grant, pinned by WITH CHECK', () => {
    // PostgREST upserts SET every payload column; without user_id here every
    // settings save fails with 42501 (security review, 2026-10-11).
    expect(migration).toMatch(/GRANT UPDATE \(user_id, protective_style/);
    expect(migration).toContain('ON public.maintenance_settings\n  FOR UPDATE TO authenticated\n  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));');
  });

  it('is owner-only: no USING (true), no provider read, origin pinned for clients', () => {
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(migration).toContain("WITH CHECK (user_id = (SELECT auth.uid()) AND origin = 'client')");
    expect(migration).toContain('CREATE POLICY maintenance_items_owner_delete');
    expect(migration).not.toMatch(/GRANT UPDATE \([^)]*origin/);
  });

  it('removes maintenance data when the client hat is deleted', () => {
    const body = fn('delete_client_profile');
    expect(body).toContain('DELETE FROM public.maintenance_items      WHERE user_id = v_uid;');
    expect(body).toContain('DELETE FROM public.maintenance_settings   WHERE user_id = v_uid;');
    expect(migration.match(/REFERENCES public\.users\(id\) ON DELETE CASCADE/g)).toHaveLength(2);
  });

  it('skips the provider rebooking nudge for a maintained service', () => {
    const body = fn('process_rebooking_nudges');
    expect(body).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(body).toContain('(mi.service_id = r.last_service_id OR mi.service_id IS NULL)');
    // Only steps aside when the maintenance reminder will actually be sent.
    expect(body).toContain("u.notification_preferences->>'maintenanceReminders'");
  });
});
