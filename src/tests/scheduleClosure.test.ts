import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { canAutoCloseWhenFull, closureReasonForClient, CLOSURE_REASONS } from '../features/providers/scheduleClosure';

it('tells a client the reason in plain words, and nothing for an unknown one', () => {
  expect(closureReasonForClient('holiday')).toBe('On holiday');
  expect(closureReasonForClient('something_new')).toBeNull();
  expect(closureReasonForClient(null)).toBeNull();
});

it('only closes automatically once the waitlist is explicitly off', () => {
  expect(canAutoCloseWhenFull(false)).toBe(true);
  expect(canAutoCloseWhenFull(true)).toBe(false);
  expect(canAutoCloseWhenFull(undefined)).toBe(false);
  expect(canAutoCloseWhenFull(null)).toBe(false);
});

const migration = readFileSync(
  join(__dirname, '../../supabase/migrations', readdirSync(join(__dirname, '../../supabase/migrations')).find(f => f.endsWith('_close_schedule_reason_and_auto.sql'))!),
  'utf8',
);

it('offers only the reasons the database accepts', () => {
  for (const { value } of CLOSURE_REASONS) expect(migration).toContain(`'${value}'`);
});

it('never shows a client a reason the provider kept private', () => {
  expect(migration).toMatch(/get_provider_closure_reason[\s\S]*c\.show_reason[\s\S]*provider_schedule_is_closed/);
});

it('only closes at the moment of filling, so reopening by hand sticks', () => {
  expect(migration).toContain("NOT (v_has_state AND v_was_full)");
  expect(migration).toContain("r.waitlist_off");
});
