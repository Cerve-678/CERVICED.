const mockSignInAsync = jest.fn();
const mockRevokeAppleSignIn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('expo-apple-authentication', () => ({ signInAsync: (...args: unknown[]) => mockSignInAsync(...args) }));
jest.mock('../services/databaseService', () => ({
  revokeAppleSignIn: (...args: unknown[]) => mockRevokeAppleSignIn(...args),
}));
jest.mock('../utils/logger', () => ({
  logger: { warn: jest.fn(), error: (...args: unknown[]) => mockLoggerError(...args) },
}));

import {
  accountUsesAppleSignIn,
  revokeAppleSignInForDeletion,
  shouldRevokeAppleSignIn,
} from '../services/appleSignInRevocation';

describe('Sign in with Apple revocation on account deletion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recognises an Apple account from any of the places Supabase records it', () => {
    expect(accountUsesAppleSignIn({ app_metadata: { providers: ['email', 'apple'] } })).toBe(true);
    expect(accountUsesAppleSignIn({ app_metadata: { provider: 'apple' } })).toBe(true);
    expect(accountUsesAppleSignIn({ identities: [{ provider: 'apple' }] })).toBe(true);
    expect(accountUsesAppleSignIn({ app_metadata: { providers: ['google'] }, identities: [{ provider: 'google' }] })).toBe(false);
    expect(accountUsesAppleSignIn(null)).toBe(false);
  });

  it('only asks Apple on iOS', () => {
    const appleUser = { app_metadata: { provider: 'apple' } };
    expect(shouldRevokeAppleSignIn(appleUser, 'ios')).toBe(true);
    expect(shouldRevokeAppleSignIn(appleUser, 'android')).toBe(false);
    expect(shouldRevokeAppleSignIn({ app_metadata: { provider: 'email' } }, 'ios')).toBe(false);
  });

  it('sends the one-time code Apple returns to the revoke function', async () => {
    mockSignInAsync.mockResolvedValue({ authorizationCode: 'code-123' });
    mockRevokeAppleSignIn.mockResolvedValue(undefined);
    await revokeAppleSignInForDeletion();
    expect(mockRevokeAppleSignIn).toHaveBeenCalledWith('code-123');
  });

  it('lets deletion carry on when the Apple sheet is closed', async () => {
    mockSignInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(revokeAppleSignInForDeletion()).resolves.toBeUndefined();
    expect(mockRevokeAppleSignIn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs, but never throws, when revoking fails', async () => {
    mockSignInAsync.mockResolvedValue({ authorizationCode: 'code-123' });
    mockRevokeAppleSignIn.mockRejectedValue(new Error('Apple said no'));
    await expect(revokeAppleSignInForDeletion()).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
