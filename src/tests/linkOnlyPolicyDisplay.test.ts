import fs from 'fs';
import path from 'path';
import { buildPolicyDisplayRows } from '../utils/policyDisplay';

const labels = (rows: ReturnType<typeof buildPolicyDisplayRows>) => rows.map(r => r.label);

// Everything a full provider can set, including money CERVICED itself applies.
const everything = {
  cancelNotice: '48h',
  cancelPenalty: 'deposit',
  cancelNote: 'Message me to cancel',
  rescheduleNotice: '24h',
  maxReschedules: '2',
  depositMode: 'deposit_required',
  depositAmount: '20',
  noShowAction: 'charge_deposit',
  noShowGraceMinutes: '15',
  lateFee: '10',
  noShowFee: '20',
  refundPolicyNote: 'Case by case',
};

test('a link-only profile shows only plain policy text, no deposits, penalties or fees', () => {
  const rows = buildPolicyDisplayRows(everything, 24, { linkOnly: true });
  expect(labels(rows)).toEqual(['Cancellation', 'Reschedule', 'Note', 'Refunds']);
  expect(rows.find(r => r.label === 'Cancellation')?.value).toBe('48h notice');
});

test('a link-only profile ignores the enforced notice column, which defaults to 24 for everyone', () => {
  const rows = buildPolicyDisplayRows({ cancelNote: 'Text me' }, 24, { linkOnly: true });
  expect(labels(rows)).toEqual(['Note']);
});

test('a full provider still sees every row', () => {
  const rows = buildPolicyDisplayRows(everything, 24);
  expect(labels(rows)).toEqual(expect.arrayContaining(['Deposit', 'No-show', 'Late fee', 'No-show fee']));
});

test('every profile surface passes the link-only flag', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  expect(read('screens', 'client', 'ProviderProfileScreen.tsx')).toContain('{ linkOnly: isLinkOnly }');
  expect(read('features', 'providers', 'profilePresentation.ts')).toContain('{ linkOnly: provider.isLinkOnly }');
  expect(read('screens', 'provider', 'LinkOnlyHomeScreen.tsx')).toContain('{ linkOnly: true }');
  expect(read('screens', 'provider', 'ProviderMyProfileScreen.tsx')).toContain("{ linkOnly: myBookingMode === 'external' }");
});

test('a link-only save clears what CERVICED would apply or charge', () => {
  const screen = fs.readFileSync(path.join(__dirname, '..', 'screens', 'provider', 'PoliciesScreen.tsx'), 'utf8');
  expect(screen).toContain('...(isLinkOnly ? LINK_ONLY_CLEARED : {})');
  for (const key of ['cancelPenalty', 'noShowAction', 'lateFee', 'noShowFee']) {
    expect(screen).toMatch(new RegExp(`LINK_ONLY_CLEARED[\\s\\S]*${key}: ''`));
  }
});
