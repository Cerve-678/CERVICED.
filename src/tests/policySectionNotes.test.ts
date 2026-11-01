import { buildPolicyDisplayRows } from '../utils/policyDisplay';

const find = (rows: ReturnType<typeof buildPolicyDisplayRows>, label: string) => rows.find(r => r.label === label);

test('each note sits under its own section, not in a loose Note row', () => {
  const rows = buildPolicyDisplayRows({
    cancelNotice: '24h',
    cancelNote: 'Cancel by message only',
    rescheduleNotice: '24h',
    maxReschedules: '1',
    rescheduleNote: 'Text me before moving it',
    noShowAction: 'charge_deposit',
    noShowNote: 'Late? Message me',
  });
  expect(rows.map(r => r.label)).not.toContain('Note');
  expect(find(rows, 'Cancellation')?.notes).toEqual(['Cancel by message only']);
  expect(find(rows, 'Reschedule')).toMatchObject({ value: '24h notice · max 1', notes: ['Text me before moving it'] });
  expect(find(rows, 'No-show')?.notes).toEqual(['Late? Message me']);
});

test('the grace period shows under No-show even with no late fee', () => {
  const rows = buildPolicyDisplayRows({ noShowAction: 'warn', noShowGraceMinutes: '15' });
  expect(find(rows, 'No-show')).toMatchObject({ value: 'Warning issued', notes: ['15 min grace period'] });
  expect(find(rows, 'Late fee')).toBeUndefined();
});

test('a grace period or note with no no-show action still gets the No-show row', () => {
  const rows = buildPolicyDisplayRows({ noShowAction: 'none', noShowGraceMinutes: '10', noShowNote: 'Call if running late' });
  expect(find(rows, 'No-show')).toMatchObject({ value: '10 min grace period', notes: ['Call if running late'] });
});

test('same-day and unlimited reschedules say so rather than disappearing', () => {
  const rows = buildPolicyDisplayRows({ rescheduleNotice: 'same_day', maxReschedules: 'unlimited' });
  expect(find(rows, 'Reschedule')?.value).toBe('Same day OK · no limit');
});

test('a note with no rule becomes the section value', () => {
  const rows = buildPolicyDisplayRows({ rescheduleNote: 'Ask me first' });
  expect(find(rows, 'Reschedule')).toEqual({ icon: 'calendar-outline', label: 'Reschedule', value: 'Ask me first' });
});
