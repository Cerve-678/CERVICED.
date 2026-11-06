import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const SCREENS = [
  ['features', 'providers', 'BecomeFullMemberSheet.tsx'],
  ['screens', 'provider', 'FullCervicedFeaturesScreen.tsx'],
  ['screens', 'provider', 'LinkOnlyHomeScreen.tsx'],
];

describe('becoming a full member', () => {
  it('names no monthly price while pricing is unfinished', () => {
    for (const parts of SCREENS) {
      const source = read(...parts);
      expect(source).not.toMatch(/£\d/);
      expect(source).not.toMatch(/a month/);
    }
    expect(read('constants', 'fullMembership.ts')).not.toMatch(/export const .*PRICE/);
  });

  it('treats "already a full member" as the switch having worked', () => {
    const auth = read('contexts', 'AuthContext.tsx');
    const body = auth.slice(auth.indexOf('const becomeFullMember = useCallback'));
    // On a refusal it asks the DB, and only rethrows if they are still link-only.
    expect(body).toMatch(/getProviderOwnershipForUserId\(user\.id\)/);
    expect(body).toMatch(/if \(bookingMode !== 'cerviced'\) throw error;/);
  });

  it('sends the one-way switch once, however fast the taps', () => {
    const sheet = read('features', 'providers', 'BecomeFullMemberSheet.tsx');
    expect(sheet).toMatch(/if \(inFlight\.current\) return;/);
  });
});
