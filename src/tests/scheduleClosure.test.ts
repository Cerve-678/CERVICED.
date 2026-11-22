import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { canCloseSchedule, closureReasonForClient, CLOSURE_REASONS, unansweredBookingCount } from '../features/providers/scheduleClosure';

it('tells a client the reason in plain words, and nothing for an unknown one', () => {
  expect(closureReasonForClient('holiday')).toBe('On holiday');
  expect(closureReasonForClient('training')).toBe('Away on training');
  expect(closureReasonForClient('something_new')).toBeNull();
  expect(closureReasonForClient(null)).toBeNull();
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
});

describe('closing waits for an answer on every upcoming booking', () => {
  const list = [
    { id: 'a', moving: false },
    { id: 'b', moving: true },
    { id: 'c', moving: false },
  ];

  it('counts bookings not kept and not being moved', () => {
    expect(unansweredBookingCount(list, new Set())).toBe(2);
    expect(unansweredBookingCount(list, new Set(['a']))).toBe(1);
    expect(unansweredBookingCount(list, new Set(['a', 'c']))).toBe(0);
  });

  it('only lets them close once every one is answered', () => {
    expect(canCloseSchedule(list, new Set(['a']), false)).toBe(false);
    expect(canCloseSchedule(list, new Set(['a', 'c']), false)).toBe(true);
  });

  it('lets someone with no upcoming bookings close straight away', () => {
    expect(canCloseSchedule([], new Set(), false)).toBe(true);
  });

  it('never closes on a list that is still loading or failed to load', () => {
    expect(canCloseSchedule(null, new Set(), false)).toBe(false);
    expect(canCloseSchedule([], new Set(), true)).toBe(false);
  });
});
