export type AccountRole = 'user' | 'provider';
export type AccountHat = 'client' | 'provider';

export interface AccountHatState {
  owned: Readonly<Record<AccountHat, boolean>>;
  active: AccountHat;
  canSwitch: boolean;
}

/** Translate the legacy database fields into the one shape the UI consumes. */
export function getOwnedHats(
  role: AccountRole,
  hasClientProfile?: boolean | null,
): Readonly<Record<AccountHat, boolean>> {
  const provider = role === 'provider';
  return {
    provider,
    client: !provider || hasClientProfile === true,
  };
}

export function ownsHat(
  role: AccountRole,
  hasClientProfile: boolean | null | undefined,
  hat: AccountHat,
): boolean {
  return getOwnedHats(role, hasClientProfile)[hat];
}

/**
 * A device preference chooses between owned hats; it can never grant a hat.
 * Unknown client ownership fails closed for a provider account.
 */
export function resolveActiveHat(
  savedHat: string | null,
  role: AccountRole,
  hasClientProfile?: boolean | null,
): AccountHat {
  const owned = getOwnedHats(role, hasClientProfile);
  if ((savedHat === 'client' || savedHat === 'provider') && owned[savedHat]) {
    return savedHat;
  }
  return owned.provider ? 'provider' : 'client';
}

export function getAccountHatState(
  role: AccountRole | null,
  hasClientProfile: boolean | null | undefined,
  active: AccountHat,
): AccountHatState {
  if (role === null) {
    return {
      owned: { client: false, provider: false },
      active,
      canSwitch: false,
    };
  }
  const owned = getOwnedHats(role, hasClientProfile);
  const safeActive = owned[active] ? active : (owned.provider ? 'provider' : 'client');
  return {
    owned,
    active: safeActive,
    canSwitch: owned.client && owned.provider,
  };
}
