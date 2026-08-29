import { accountHats, resolveRestoredMode } from '../utils/accountHats';

// The client hat got its own column (migration 20260823105742) but the hat-
// restore path was never taught to read it: it rejected a stored 'provider'
// for a non-provider and accepted a stored 'client' for a provider with no
// client profile, which is how an account ended up in a hat it doesn't hold.
describe('accountHats', () => {
  it('gives a plain client account the client hat and nothing else', () => {
    expect(accountHats('user', false)).toEqual({ ownsProvider: false, ownsClient: true });
  });

  it('does not let has_client_profile grant a provider hat', () => {
    // The column owns the client hat only — `role` is the provider hat's source.
    expect(accountHats('user', true).ownsProvider).toBe(false);
  });

  it('gives a provider both hats only when the column says so', () => {
    expect(accountHats('provider', true)).toEqual({ ownsProvider: true, ownsClient: true });
    expect(accountHats('provider', false)).toEqual({ ownsProvider: true, ownsClient: false });
  });

  it('treats an unknown column as no client hat for the switch guards', () => {
    // applyMode/switchMode always know the real value, so absence is absence.
    expect(accountHats('provider', null).ownsClient).toBe(false);
    expect(accountHats('provider', undefined).ownsClient).toBe(false);
  });

  it('survives a null user without granting anything it shouldn\'t', () => {
    expect(accountHats(undefined, undefined)).toEqual({ ownsProvider: false, ownsClient: true });
  });
});

describe('resolveRestoredMode', () => {
  it('restores the saved hat when the account holds it', () => {
    expect(resolveRestoredMode('client', 'provider', true)).toBe('client');
    expect(resolveRestoredMode('provider', 'provider', true)).toBe('provider');
    expect(resolveRestoredMode('client', 'user', false)).toBe('client');
  });

  it('refuses a saved provider hat for a non-provider', () => {
    // Deleting the provider hat on one device must not leave another device
    // booted into an empty provider tree.
    expect(resolveRestoredMode('provider', 'user', true)).toBe('client');
  });

  it('refuses a saved client hat for a provider who has no client profile', () => {
    // This is the case the old role-only version let through.
    expect(resolveRestoredMode('client', 'provider', false)).toBe('provider');
  });

  it('does not bounce a provider out of the client hat when the column is unknown', () => {
    // The metadata-fallback path can't read the column. Asserting absence there
    // would strip a genuine dual-hat account's client hat on a transient
    // profile-fetch failure — a worse bug than the one being fixed.
    expect(resolveRestoredMode('client', 'provider', null)).toBe('client');
  });

  it('falls back to the account\'s primary hat when nothing is saved', () => {
    expect(resolveRestoredMode(null, 'provider', false)).toBe('provider');
    expect(resolveRestoredMode(null, 'provider', true)).toBe('provider');
    expect(resolveRestoredMode(null, 'user', true)).toBe('client');
  });

  it('ignores a saved value that is not a hat', () => {
    // A key left by an older build, or a partial write.
    expect(resolveRestoredMode('', 'provider', false)).toBe('provider');
    expect(resolveRestoredMode('nonsense', 'user', true)).toBe('client');
  });
});
