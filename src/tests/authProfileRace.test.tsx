import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

let mockListener: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
const mockProfile = jest.fn();
const mockCreateRow = jest.fn();
jest.mock('../services/databaseService', () => ({
  subscribeToAuthStateChanges: (listener: typeof mockListener) => {
    mockListener = listener;
    return jest.fn();
  },
  getUserProfileById: (...args: unknown[]) => mockProfile(...args),
  createSocialProfileIfMissing: (...args: unknown[]) => mockCreateRow(...args),
  getProviderOwnershipForUserId: jest.fn().mockResolvedValue({ providerId: null, bookingMode: null }),
}));
jest.mock('../services/pushNotificationService', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
  startExpoGoNotificationBridge: () => () => {},
}));
jest.mock('../services/biometricService', () => ({ updateBiometricToken: jest.fn() }));
jest.mock('../navigation/modeController', () => ({ registerModeSetter: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const mockSnapshot = { saved: null as unknown };
jest.mock('../services/authProfileSnapshot', () => ({
  readAuthProfileSnapshot: jest.fn(async () => mockSnapshot.saved),
  saveAuthProfileSnapshot: jest.fn(async () => {}),
  clearAuthProfileSnapshot: jest.fn(async () => {}),
}));

import { AuthProvider, useAuth } from '../contexts/AuthContext';

const session = (id: string) => ({ user: {
  id, email: `${id}@example.com`, email_confirmed_at: '2026-01-01', user_metadata: {},
} }) as Session;
const profile = (id: string) => ({ id, name: id, role: 'user', has_client_profile: true });
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSnapshot.saved = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('a profile response arriving after sign-out cannot log the user back in', async () => {
  let finish!: (value: unknown) => void;
  mockProfile.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(useAuth, { wrapper });
  let loading!: Promise<void>;
  act(() => { loading = mockListener('SIGNED_IN', session('first')); });
  await act(async () => { await mockListener('SIGNED_OUT', null); });
  await act(async () => { finish(profile('first')); await loading; });
  expect(result.current.isLoggedIn).toBe(false);
  expect(result.current.user).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

test('the latest session wins when profile requests finish out of order', async () => {
  // The first load may be abandoned before it even asks for its profile
  // (it checks for a saved launch copy first), so this can stay unset.
  let finishFirst: ((value: unknown) => void) | undefined;
  mockProfile.mockImplementation(id => id === 'first'
    ? new Promise(resolve => { finishFirst = resolve; })
    : Promise.resolve(profile(id)));
  const { result } = renderHook(useAuth, { wrapper });
  let first!: Promise<void>;
  act(() => { first = mockListener('INITIAL_SESSION', session('first')); });
  await act(async () => { await mockListener('SIGNED_IN', session('second')); });
  expect(result.current.user?.id).toBe('second');
  await act(async () => { finishFirst?.(profile('first')); await first; });
  expect(result.current.user?.id).toBe('second');
  expect(result.current.isLoggedIn).toBe(true);
});

const appleSession = (id: string) => ({ user: {
  ...session(id).user, app_metadata: { provider: 'apple' },
} }) as Session;

test('a first Apple sign-in creates the users row and reads it back', async () => {
  mockProfile.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...profile('apple'), name: 'Ana', dob: null });
  mockCreateRow.mockResolvedValue(undefined);
  const { result } = renderHook(useAuth, { wrapper });
  await act(async () => { await mockListener('SIGNED_IN', appleSession('apple')); });
  expect(mockCreateRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'apple', loginMethod: 'apple' }));
  expect(result.current.user).toMatchObject({ name: 'Ana', dob: '', hasClientProfile: true });
  expect(result.current.isLoggedIn).toBe(true);
});

test('an email account with no row yet is left to its own signup', async () => {
  mockProfile.mockResolvedValue(null);
  const { result } = renderHook(useAuth, { wrapper });
  await act(async () => { await mockListener('SIGNED_IN', session('emailed')); });
  expect(mockCreateRow).not.toHaveBeenCalled();
  expect(result.current.isLoggedIn).toBe(true);
});

const savedUser = (id: string) => ({
  id, name: `${id} saved`, email: `${id}@example.com`, phone: '', dob: '',
  accountType: 'user', loginMethod: 'email', hasClientProfile: true,
});

test('launch opens the app from the saved profile before the server answers', async () => {
  mockSnapshot.saved = savedUser('first');
  let finish!: (value: unknown) => void;
  mockProfile.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(useAuth, { wrapper });
  let loading!: Promise<void>;
  await act(async () => { loading = mockListener('INITIAL_SESSION', session('first')); });
  expect(result.current.isLoading).toBe(false);
  expect(result.current.isLoggedIn).toBe(true);
  expect(result.current.user?.name).toBe('first saved');

  await act(async () => { finish(profile('first')); await loading; });
  expect(result.current.user?.name).toBe('first');
});

test('a failed refresh keeps the saved profile rather than dropping to session metadata', async () => {
  mockSnapshot.saved = savedUser('first');
  mockProfile.mockRejectedValue(new Error('network'));
  const { result } = renderHook(useAuth, { wrapper });
  await act(async () => { await mockListener('INITIAL_SESSION', session('first')); });
  expect(result.current.isLoggedIn).toBe(true);
  expect(result.current.user?.name).toBe('first saved');
});

test('a later sign-in never uses a saved profile, it waits for the server', async () => {
  const { readAuthProfileSnapshot } = jest.requireMock('../services/authProfileSnapshot') as { readAuthProfileSnapshot: jest.Mock };
  mockSnapshot.saved = savedUser('first');
  mockProfile.mockImplementation(async (id: string) => profile(id));
  const { result } = renderHook(useAuth, { wrapper });
  await act(async () => { await mockListener('INITIAL_SESSION', null); });
  await act(async () => { await mockListener('SIGNED_IN', session('first')); });
  expect(readAuthProfileSnapshot).not.toHaveBeenCalled();
  expect(result.current.user?.name).toBe('first');
});

describe('a provider who also has a client account', () => {
  const providerSession = () => ({ user: {
    id: 'dual', email: 'dual@example.com', email_confirmed_at: '2026-01-01',
    user_metadata: { name: 'Dual', role: 'provider' },
  } }) as unknown as Session;
  const dualProfile = { id: 'dual', name: 'Dual', role: 'provider', has_client_profile: true };
  const signIn = async () => {
    await act(async () => { await mockListener('INITIAL_SESSION', null); });
    await act(async () => { await mockListener('SIGNED_IN', providerSession()); });
  };

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('a slow sign-in leaves the client hat unknown, then a retry confirms it', async () => {
    mockProfile.mockRejectedValueOnce(new Error('Profile restore timed out')).mockResolvedValue(dualProfile);
    const { result } = renderHook(useAuth, { wrapper });
    await signIn();
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.hatState.clientHatKnown).toBe(false);

    await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });
    expect(result.current.hatState.clientHatKnown).toBe(true);
    expect(result.current.hatState.canSwitch).toBe(true);
  });

  test('a read with no row is retried rather than believed', async () => {
    mockProfile.mockResolvedValueOnce(null).mockResolvedValue(dualProfile);
    const { result } = renderHook(useAuth, { wrapper });
    await signIn();
    expect(result.current.hatState.clientHatKnown).toBe(false);

    await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });
    expect(result.current.hatState.canSwitch).toBe(true);
  });

  test('retries stop after three tries, leaving the hat unknown rather than absent', async () => {
    mockProfile.mockRejectedValue(new Error('network'));
    const { result } = renderHook(useAuth, { wrapper });
    await signIn();
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000); });
    expect(mockProfile).toHaveBeenCalledTimes(4);
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.hatState.clientHatKnown).toBe(false);
  });

  test('sign-out stops the retries', async () => {
    mockProfile.mockRejectedValue(new Error('network'));
    renderHook(useAuth, { wrapper });
    await signIn();
    await act(async () => { await mockListener('SIGNED_OUT', null); });
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000); });
    expect(mockProfile).toHaveBeenCalledTimes(1);
  });

  test('a read with no row at launch keeps the saved profile and its copy', async () => {
    const { clearAuthProfileSnapshot } = jest.requireMock('../services/authProfileSnapshot') as { clearAuthProfileSnapshot: jest.Mock };
    mockSnapshot.saved = { ...savedUser('dual'), accountType: 'provider' };
    mockProfile.mockResolvedValue(null);
    const { result } = renderHook(useAuth, { wrapper });
    await act(async () => { await mockListener('INITIAL_SESSION', providerSession()); });
    expect(result.current.hatState.canSwitch).toBe(true);
    expect(clearAuthProfileSnapshot).not.toHaveBeenCalled();
  });

  test('a failed reload never takes the client hat off a profile already shown', async () => {
    mockProfile.mockResolvedValueOnce(dualProfile).mockRejectedValue(new Error('network'));
    const { result } = renderHook(useAuth, { wrapper });
    await signIn();
    expect(result.current.hatState.canSwitch).toBe(true);
    await act(async () => { await mockListener('SIGNED_IN', providerSession()); });
    expect(result.current.hatState.canSwitch).toBe(true);
  });
});
