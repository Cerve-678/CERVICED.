import { readFileSync } from 'fs';
import { join } from 'path';

// The rules a closed schedule has to keep, read from the migration that makes
// them. Each one protects something a passing app-side test wouldn't notice:
// the booking gate is the only thing that actually stops a booking.
const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261101160000_close_schedule_by_hand.sql'),
  'utf8',
);
const fnBody = (name: string): string => {
  const start = MIGRATION.indexOf(`FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  return MIGRATION.slice(start, MIGRATION.indexOf('$function$;', start));
};

describe('closing a schedule by hand', () => {
  const gate = fnBody('enforce_booking_bookability');

  it('stops new bookings, but only inside the policy checks a provider can bypass', () => {
    const check = gate.indexOf('provider_schedule_is_closed(NEW.provider_id)');
    expect(check).toBeGreaterThan(gate.indexOf('IF NOT v_bypass_policy THEN'));
    expect(check).toBeLessThan(gate.indexOf('v_last_bookable := public.provider_last_bookable_date'));
    expect(gate).toContain("RAISE EXCEPTION 'This provider is not taking bookings right now'");
  });

  it('lets a move the provider agreed to carry on', () => {
    expect(gate).toContain("IF TG_OP = 'INSERT'\n       AND NEW.reschedule_hold_for IS NULL");
  });

  it('means no openings anywhere that reads the free-slot check', () => {
    expect(fnBody('get_services_open_within')).toContain('AND NOT public.provider_schedule_is_closed(p.id)');
  });

  it('never tells followers to book a month a closed provider has not opened', () => {
    expect(fnBody('process_follow_schedule_release_nudges')).toContain('AND NOT public.provider_schedule_is_closed(p.id)');
  });

  it('keeps why and until when private', () => {
    expect(MIGRATION).toContain('ALTER TABLE public.provider_schedule_closures ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('REVOKE ALL ON public.provider_schedule_closures FROM PUBLIC, anon, authenticated');
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*provider_schedule_closures/);
    expect(fnBody('provider_is_taking_bookings')).toContain('RETURNS boolean');
  });

  it('lets a chosen date win over the release day', () => {
    const closed = fnBody('provider_schedule_is_closed');
    expect(closed.indexOf('WHEN c.reopens_on IS NOT NULL')).toBeLessThan(closed.indexOf('provider_next_release_after'));
  });

  it('refuses to apply over a function that changed after this was written', () => {
    expect(MIGRATION.match(/rebuild from live/g)).toHaveLength(3);
  });
});
