// Which hats an account holds, in one place.
//
// The answer used to be re-derived at three call sites in AuthContext
// (resolveRestoredMode, applyMode, switchMode), and they did not agree:
// the two switch guards consulted both hats, while the restore path checked
// only the provider one — so it could reject a stored 'provider' for a
// non-provider but happily restore a stored (or defaulted) 'client' for a
// provider who has no client profile.
//
// `role` owns the provider hat. `has_client_profile` owns the client hat
// (migration 20260823105742) — never re-derive it from `dob`, which is the
// inference that column replaced.

/** Re-exported by AuthContext, which is where the rest of the app imports it
 *  from — it lives here so this module has no dependency on the context. */
export type AccountType = 'user' | 'provider';

export type Hat = 'provider' | 'client';

/** `hasClientProfile: null` means "not known here" — see resolveRestoredMode. */
export interface HatOwnership {
  ownsProvider: boolean;
  ownsClient: boolean;
}

export function accountHats(
  role: AccountType | undefined,
  hasClientProfile: boolean | null | undefined,
): HatOwnership {
  const ownsProvider = role === 'provider';
  return {
    ownsProvider,
    // A non-provider account is a client account by definition — the column is
    // only load-bearing for providers, who may or may not have added one.
    ownsClient: !ownsProvider || hasClientProfile === true,
  };
}

/**
 * Restore the device-local persisted hat, but never into a hat this account
 * doesn't hold. The saved mode is a preference; the server's role and
 * has_client_profile are the statement of what exists, and the server wins —
 * otherwise deleting a hat on one device leaves another device booted into an
 * empty tree with no obvious way back, since the switch control only renders
 * for accounts that actually have the other hat.
 *
 * `hasClientProfile` is nullable on purpose. AuthContext's metadata-fallback
 * path genuinely does not know (session metadata doesn't carry the column), and
 * forcing a dual-hat provider out of the client hat on a transient profile-fetch
 * failure would be a worse bug than the one this fixes. null means "unknown,
 * don't enforce"; only a definite `false` bounces them.
 */
export function resolveRestoredMode(
  savedMode: string | null,
  role: AccountType,
  hasClientProfile: boolean | null,
): Hat {
  const { ownsProvider } = accountHats(role, hasClientProfile);
  // `null` is "unknown" here rather than "absent", so only a definite false
  // rules the client hat out. accountHats itself is deliberately stricter —
  // its callers (the switch guards) always know the real value.
  const ownsClient = !ownsProvider || hasClientProfile !== false;

  const saved = savedMode === 'provider' || savedMode === 'client' ? savedMode : null;
  if (saved === 'provider' && !ownsProvider) return 'client';
  if (saved === 'client' && !ownsClient) return 'provider';
  return saved ?? (ownsProvider ? 'provider' : 'client');
}
