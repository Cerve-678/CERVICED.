import fs from 'fs';
import path from 'path';

/**
 * The maintenance reminder names what is due (2026-11-11) instead of the old
 * "You have something due. Open CERVICED to see it." The SQL can't run here,
 * so this pins the wording and that the cron fills it from the copy function.
 */
const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261111090000_maintenance_reminder_names_item.sql'),
  'utf8',
);
const fn = (name: string): string => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$function$;', start));
};

describe('maintenance reminder copy', () => {
  it('names the item in every reminder and drops the generic line', () => {
    const copy = fn('maintenance_notification_copy');
    expect(copy).toContain("'Your {item} is due.'");
    expect(copy).toContain("'Your {item} is still due.'");
    expect(copy).toContain("'Time to book in for {item} on {date}.'");
    expect(copy).not.toContain('Open CERVICED');
  });

  it('fills the placeholders from the item, adding the provider for services', () => {
    const body = fn('process_maintenance_reminders');
    expect(body).toContain("WHEN r.kind = 'service' AND r.provider_name IS NOT NULL");
    expect(body).toContain("replace(replace(v_copy.message, '{item}', v_item)");
    expect(body).toMatch(/v_copy\.title, v_message/);
  });

  it('keeps the existing rules: opted-in only, two pushes max, silent while booked', () => {
    const body = fn('process_maintenance_reminders');
    expect(body).toContain("COALESCE(u.notification_preferences->>'maintenanceReminders', 'false') = 'true'");
    expect(body).toContain("b.status IN ('pending', 'confirmed', 'in_progress')");
    expect(body).toContain('i.due_push_count = 1');
    expect(body).toContain('LIMIT 5000');
  });
});
