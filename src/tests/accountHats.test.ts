import { describe, expect, it } from '@jest/globals';
import {
  getAccountHatState,
  getOwnedHats,
  resolveActiveHat,
  type AccountHat,
  type AccountRole,
} from '../utils/accountHats';

const ownershipCases: Array<[
  AccountRole,
  boolean,
  { client: boolean; provider: boolean },
]> = [
  ['user', false, { client: true, provider: false }],
  ['user', true, { client: true, provider: false }],
  ['provider', false, { client: false, provider: true }],
  ['provider', true, { client: true, provider: true }],
];

const restorationCases: Array<[
  AccountHat | null,
  AccountRole,
  boolean,
  AccountHat,
]> = [
  ['provider', 'user', true, 'client'],
  ['client', 'user', true, 'client'],
  ['client', 'provider', false, 'provider'],
  ['provider', 'provider', false, 'provider'],
  ['client', 'provider', true, 'client'],
  ['provider', 'provider', true, 'provider'],
  [null, 'provider', true, 'provider'],
];

describe('account hats', () => {
  it.each(ownershipCases)('%s / client=%s owns the correct hats', (role, client, expected) => {
    expect(getOwnedHats(role, client)).toEqual(expected);
  });

  it.each(restorationCases)('saved=%s role=%s client=%s -> %s', (saved, role, client, expected) => {
    expect(resolveActiveHat(saved, role, client)).toBe(expected);
  });

  it('fails closed when provider client ownership is unknown', () => {
    expect(resolveActiveHat('client', 'provider')).toBe('provider');
  });

  it('presents one clear UI-facing state', () => {
    expect(getAccountHatState('provider', true, 'client')).toEqual({
      owned: { client: true, provider: true },
      active: 'client',
      canSwitch: true,
    });
  });

  it('never exposes an active hat that is not owned', () => {
    expect(getAccountHatState('provider', false, 'client').active).toBe('provider');
    expect(getAccountHatState('user', true, 'provider').active).toBe('client');
  });

  it('presents no ownership while signed out', () => {
    expect(getAccountHatState(null, undefined, 'client')).toEqual({
      owned: { client: false, provider: false },
      active: 'client',
      canSwitch: false,
    });
  });
});
