import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'databaseService.ts'),
  'utf8',
);

// Payout reads re-confirm the account with the Auth server so a just-banned or
// deleted account is refused on the money screen immediately.
const SERVER_CHECKED = ['getProviderPayouts'];

/** Name of the function each `await supabase.auth.getUser()` call sits in. */
function getUserCallers(): string[] {
  const callers: string[] = [];
  const call = /await supabase\.auth\.getUser\(\)/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source))) {
    const before = source.slice(0, match.index);
    const fns = [...before.matchAll(/function (\w+)\s*\(/g)];
    callers.push(fns[fns.length - 1]?.[1] ?? '<top level>');
  }
  return callers;
}

describe('auth round-trip contract', () => {
  it('reads the signed-in user from the stored session outside payouts', () => {
    // getUser() is a network call to the Auth server. Before every query it
    // added a round trip to almost every screen load; getSessionUser() reads
    // the stored session instead and RLS still verifies the token.
    const unexpected = getUserCallers().filter((fn) => !SERVER_CHECKED.includes(fn));
    expect(unexpected).toEqual([]);
  });

  it('keeps the server re-check on payout reads', () => {
    expect(getUserCallers()).toEqual(expect.arrayContaining(SERVER_CHECKED));
  });
});
