import { readFileSync } from 'fs';
import { join } from 'path';
import { WAITLIST_HOLD_MINUTES } from '../constants/waitlist';

// The rules from 20261118150000, read from the migration itself: the database
// is what actually decides who gets a freed slot, so a passing app test
// wouldn't notice any of these coming undone.
const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261118150000_waitlist_auto_and_close_together.sql'),
  'utf8',
);
const fnBody = (name: string): string => {
  const start = MIGRATION.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return MIGRATION.slice(start, MIGRATION.indexOf('$function$;', start));
};

describe('waitlist Auto and closing when full', () => {
  it('holds a slot for the same minutes the app shows', () => {
    expect(WAITLIST_HOLD_MINUTES).toBe(10);
    expect(fnBody('waitlist_hold_duration')).toContain(`INTERVAL '${WAITLIST_HOLD_MINUTES} minutes'`);
  });

  it('only holds a freed slot automatically when Auto is on', () => {
    const freed = fnBody('waitlist_slot_freed');
    expect(freed).toContain("automation_settings->>'autoAcceptWaitlist'");
    expect(freed.indexOf('IF v_auto THEN')).toBeLessThan(freed.indexOf('invite_next_waitlist_entry'));
    // Auto off: the provider is told and offers it from Bookings.
    expect(freed).toContain("'cancelled'");
    expect(freed).toContain('from Bookings');
  });

  it('never fails the cancellation it runs inside', () => {
    expect(fnBody('waitlist_slot_freed')).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });

  it('sends every cancelled or declined slot through the Auto check', () => {
    const trigger = fnBody('handle_booking_status_change');
    expect(trigger.match(/waitlist_slot_freed\(/g)).toHaveLength(2);
    expect(trigger).not.toContain('invite_next_waitlist_entry(');
  });

  it('closes when full with the waitlist on too', () => {
    const alerts = fnBody('process_provider_fully_booked_alerts');
    expect(alerts).toContain('IF NOT (v_has_state AND v_was_full) AND r.auto_close THEN');
    expect(alerts).not.toContain('r.auto_close AND r.waitlist_off');
  });

  it('lets only the waitlist through a schedule closed because it is full', () => {
    expect(fnBody('provider_schedule_closed_to_waitlist')).toContain("c.reason = 'fully_booked'");
    const gate = fnBody('enforce_booking_bookability');
    expect(gate).toContain('NOT (NEW.waitlist_entry_id IS NOT NULL');
    expect(gate).toContain("RAISE EXCEPTION 'This provider is not taking bookings right now'");
    for (const name of ['invite_next_waitlist_entry', 'end_waitlist_hold', 'waitlist_slot_freed']) {
      expect(fnBody(name)).toContain('provider_schedule_closed_to_waitlist(');
    }
  });

  it('accepts a slot freed by a cancellation', () => {
    expect(MIGRATION).toContain("ARRAY['missed'::text, 'passed'::text, 'cancelled'::text]");
  });

  it('refuses to apply over a function that changed after this was written', () => {
    expect(MIGRATION).toContain('rebuild from live');
    expect(MIGRATION.match(/\('[a-z_]+', '[0-9a-f]{32}'\)/g)).toHaveLength(6);
  });
});
