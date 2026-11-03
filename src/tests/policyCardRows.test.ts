import { buildPolicyDisplayRows } from '../utils/policyDisplay';

describe("the provider's own policy summary", () => {
  it('says there is no deposit, for the provider only', () => {
    const policy = { depositMode: 'full_only', cancelNotice: '24h' };
    expect(buildPolicyDisplayRows(policy, 24, { showNoDeposit: true })[0]).toMatchObject({ label: 'Deposit', value: 'No deposit' });
    expect(buildPolicyDisplayRows(policy, 24).some(r => r.label === 'Deposit')).toBe(false);
  });

  it('reads a never-configured deposit, and a deposit with no amount, as no deposit', () => {
    expect(buildPolicyDisplayRows({ cancelNotice: '24h' }, 24, { showNoDeposit: true })[0]?.value).toBe('No deposit');
    expect(buildPolicyDisplayRows({ depositMode: 'client_choice', depositAmount: '' }, 0, { showNoDeposit: true })[0]?.value).toBe('No deposit');
  });

  it('still shows a real deposit once, not a no-deposit row beside it', () => {
    const rows = buildPolicyDisplayRows({ depositMode: 'client_choice', depositType: 'percent', depositAmount: '20' }, 0, { showNoDeposit: true });
    expect(rows.filter(r => r.label === 'Deposit').map(r => r.value)).toEqual(['20% (optional)']);
  });

  it('does not add a deposit row for a link-only provider', () => {
    expect(buildPolicyDisplayRows({ cancelNotice: '24h' }, 24, { linkOnly: true, showNoDeposit: true }).some(r => r.label === 'Deposit')).toBe(false);
  });
});
