// My Profile's Deposits & rules tile shows at most three rules, then
// "+N more", so a provider with many rules doesn't get a tile that runs on.

import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'provider', 'ProviderMyProfileScreen.tsx'),
  'utf8',
);

describe('My Profile Deposits & rules tile', () => {
  it('lists at most three rules', () => {
    expect(src).toContain('const MAX_POLICY_PREVIEWS = 3;');
    expect(src).toContain('policyRows.slice(0, MAX_POLICY_PREVIEWS).map(');
    expect(src).not.toContain('{policyRows.map(');
  });

  it('says how many more there are', () => {
    expect(src).toContain('+{policyRows.length - MAX_POLICY_PREVIEWS} more');
  });
});
