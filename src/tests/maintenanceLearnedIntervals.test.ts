import fs from 'fs';
import path from 'path';
import { MAINTENANCE_SERVICE_TYPES } from '../constants/maintenanceServiceTypes';

/**
 * Source contracts for learned intervals (stage 2 of "Your rhythm"). The SQL
 * can't run here, so each assertion pins a decision tsc and Jest can't see.
 */
const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261019150000_maintenance_learned_intervals.sql'),
  'utf8',
);
const fn = (name: string): string => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$function$;', start));
};

describe('learned interval precedence (user decision 2026-10-19)', () => {
  const body = fn('handle_booking_completed_maintenance');

  it('ranks provider recommendation, then learned habit, then the neutral default', () => {
    const provider = body.indexOf("v_source := 'provider'");
    const learned = body.indexOf("v_source := 'learned'");
    const fallback = body.indexOf("v_source := 'default'");
    expect(provider).toBeGreaterThan(-1);
    expect(provider).toBeLessThan(learned);
    expect(learned).toBeLessThan(fallback);
  });

  it('still never overrides an interval the client set', () => {
    expect(body).toMatch(/repeat_weeks\s+= CASE WHEN public\.maintenance_items\.interval_edited\s+THEN public\.maintenance_items\.repeat_weeks/);
    expect(body).toMatch(/interval_source\s+= CASE WHEN public\.maintenance_items\.interval_edited\s+THEN 'client'/);
    const beforeUpdate = fn('maintenance_items_before_update');
    expect(beforeUpdate).toContain("NEW.interval_source := 'client'");
    expect(beforeUpdate).toContain('OR NOT OLD.interval_edited');
  });

  it('keeps the trigger unable to roll back the booking', () => {
    expect(body.match(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/g)).toHaveLength(2);
    expect(body).toMatch(/\n SECURITY DEFINER\n/);
    // A provider's figure is length-checked before it's cast.
    expect(body).toContain("v_nudge ~ '^[0-9]{1,2}$'");
  });
});

describe('the learned gap', () => {
  const gap = fn('maintenance_learned_gap');

  it('reads only this client\'s completed bookings, bounded', () => {
    expect(gap).toContain('bk.user_id = p_user');
    expect(gap).toContain("bk.status = 'completed'");
    expect(gap).toMatch(/LIMIT 60/);
    expect(gap).toMatch(/LIMIT 6\b/);
  });

  it('ignores gaps under a week and needs 3 visits and 2 usable gaps', () => {
    expect(gap).toContain('g.gap >= 7');
    expect(gap).toContain('HAVING count(*) >= 2');
    expect(gap).toContain('(SELECT count(*) FROM visits) >= 3');
    expect(sql).toContain('CHECK (interval_source IN (\'client\', \'provider\', \'learned\', \'default\'))');
  });

  it('is server-only: nothing new is granted or readable by providers', () => {
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|SELECT|EXECUTE)/);
    expect(sql).not.toMatch(/CREATE POLICY|USING\s*\(\s*true/i);
    for (const name of ['maintenance_type_for(text, text)', 'maintenance_learned_gap(uuid, text)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon, authenticated;`);
    }
  });
});

describe('injectables can never become a reminder', () => {
  it('has no AESTHETICS catch-all, so an unmatched aesthetics booking makes no item', () => {
    const aesthetics = MAINTENANCE_SERVICE_TYPES.filter(t => t.searchCategory === 'AESTHETICS');
    expect(aesthetics.every(t => t.keywords.length > 0)).toBe(true);
    for (const name of ['botox', 'lip filler', 'anti-wrinkle injections', 'profhilo']) {
      expect(aesthetics.some(t => t.keywords.some(k => name.includes(k)))).toBe(false);
    }
  });
});
