import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// The code screen must never leave a new account on a spinning button. Once
// the code checks out, the sign-up answers get SIGNUP_SAVE_WAIT_MS to save;
// past that the app opens anyway (the usual sign-in path) and the save is
// retried in the background.

const mockBegin = jest.fn();
const mockComplete = jest.fn();
const mockCancel = jest.fn();
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    beginSignupVerification: mockBegin,
    completeVerifiedSignup: mockComplete,
    cancelSignupVerification: mockCancel,
  }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    palette: { text: '#000', sub: '#666', card: '#fff', border: '#ccc', accent: '#AF9197', accentText: '#000', onAccent: '#fff' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../components/ThemedBackground', () => ({
  ThemedBackground: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../services/biometricService', () => ({
  isBiometricAvailable: jest.fn(async () => false),
  getBiometricLabel: jest.fn(),
  enableBiometric: jest.fn(),
}));
jest.mock('../utils/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const mockUpsert = jest.fn();
jest.mock('../services/databaseService', () => ({
  verifySignupOtp: jest.fn(async () => ({
    userId: 'new-user',
    email: 'new@example.com',
    userMetadata: { name: 'New User', role: 'user' },
    authSession: { user: { id: 'new-user', email_confirmed_at: '2026-11-03' } },
    refreshToken: null,
  })),
  upsertVerifiedUserProfile: (...args: unknown[]) => mockUpsert(...args),
  resendSignupOtp: jest.fn(),
  invokeSendAccountEmail: jest.fn(async () => {}),
}));

import EmailVerificationScreen, { SIGNUP_SAVE_WAIT_MS } from '../screens/auth/EmailVerificationScreen';

function enterCodeAndVerify() {
  render(
    <EmailVerificationScreen
      navigation={{ reset: jest.fn() } as never}
      route={{ key: 'k', name: 'EmailVerification', params: { email: 'new@example.com' } } as never}
    />,
  );
  fireEvent.changeText(screen.getByLabelText('Digit 1'), '123456');
  fireEvent.press(screen.getByText('VERIFY & FINISH'));
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('opens the app straight from the saved sign-up when the save is quick', async () => {
  mockUpsert.mockResolvedValue({ hasClientProfile: true });
  enterCodeAndVerify();
  await act(flush);
  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(mockComplete.mock.calls[0][0]).toMatchObject({ id: 'new-user', name: 'New User', hasClientProfile: true });
  expect(mockCancel).not.toHaveBeenCalled();
});

it('opens the app after the wait when the save hangs, and keeps saving in the background', async () => {
  mockUpsert.mockImplementation(() => new Promise(() => {}));
  enterCodeAndVerify();
  await act(flush);
  expect(mockCancel).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(SIGNUP_SAVE_WAIT_MS); await flush(); });
  expect(mockCancel).toHaveBeenCalledTimes(1); // hands over to the usual sign-in
  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockUpsert).toHaveBeenCalledTimes(2); // the background retry
  expect(screen.getByText('VERIFY & FINISH')).toBeTruthy(); // no spinner left
  expect(Alert.alert).not.toHaveBeenCalled();
});
