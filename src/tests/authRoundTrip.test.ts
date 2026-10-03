import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'databaseService.ts'),
  'utf8',
);

describe('auth round-trip contract', () => {
  it('reads the signed-in user from the stored session, not the Auth server', () => {
    // getUser() is a network call to the Auth server. Before every query it
    // added a round trip to almost every screen load; getSessionUser() reads
    // the stored session instead and RLS still verifies the token.
    const calls = source.match(/await supabase\.auth\.getUser\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('keeps the server re-check on payouts only', () => {
    const payouts = source.slice(source.indexOf('export async function getProviderPayouts'));
    expect(payouts.slice(0, 600)).toContain('await supabase.auth.getUser()');
  });
});
