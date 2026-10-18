import { buildPolicyDisplayRows } from '../utils/policyDisplay';

const row = (rows: ReturnType<typeof buildPolicyDisplayRows>, label: string) => rows.find(r => r.label === label)?.value;

test('shows a late fee with the grace period and a no-show fee to the client', () => {
  const rows = buildPolicyDisplayRows({ lateFee: '10', noShowGraceMinutes: '15', noShowFee: '12.5' });
  expect(row(rows, 'Late fee')).toBe('£10 after 15 min');
  expect(row(rows, 'No-show fee')).toBe('£12.50');
});

test('shows no fee row for a blank, zero or malformed amount', () => {
  const rows = buildPolicyDisplayRows({ lateFee: '', noShowFee: '0' });
  expect(row(rows, 'Late fee')).toBeUndefined();
  expect(row(rows, 'No-show fee')).toBeUndefined();
  expect(row(buildPolicyDisplayRows({ lateFee: '10.555' }), 'Late fee')).toBeUndefined();
});

test('never promises a full no-show charge — the retired option reads as deposit kept', () => {
  expect(row(buildPolicyDisplayRows({ noShowAction: 'charge_full' }), 'No-show')).toBe('Deposit kept');
  expect(row(buildPolicyDisplayRows({ noShowAction: 'charge_deposit' }), 'No-show')).toBe('Deposit kept');
});
