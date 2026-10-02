import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

let mockListener: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
const mockProfile = jest.fn();
jest.mock('../services/databaseService', () => ({
  subscribeToAuthStateChanges: (listener: typeof mockListener) => {
    mockListener = listener;
    return jest.fn();
  },
  getUserProfileById: (...args: unknown[]) => mockProfile(...args),
  getProviderIdForUserId: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/pushNotificationService', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
  startExpoGoNotificationBridge: () => () => {},
}));
jest.mock('../services/biometricService', () => ({ updateBiometricToken: jest.fn() }));
jest.mock('../navigation/modeController', () => ({ registerModeSetter: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { AuthProvider, useAuth } from '../contexts/AuthContext';

const session = (id: string) => ({ user: {
  id, email: `${id}@example.com`, email_confirmed_at: '2026-01-01', user_metadata: {},
} }) as Session;
const profile = (id: string) => ({ id, name: id, role: 'user', has_client_profile: true });
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
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
  let finishFirst!: (value: unknown) => void;
  mockProfile.mockImplementation(id => id === 'first'
    ? new Promise(resolve => { finishFirst = resolve; })
    : Promise.resolve(profile(id)));
  const { result } = renderHook(useAuth, { wrapper });
  let first!: Promise<void>;
  act(() => { first = mockListener('INITIAL_SESSION', session('first')); });
  await act(async () => { await mockListener('SIGNED_IN', session('second')); });
  expect(result.current.user?.id).toBe('second');
  await act(async () => { finishFirst(profile('first')); await first; });
  expect(result.current.user?.id).toBe('second');
  expect(result.current.isLoggedIn).toBe(true);
});
