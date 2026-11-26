import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { revokeAppleSignIn } from './databaseService';
import { logger } from '../utils/logger';

/** Just the parts of a Supabase auth user this needs. */
interface SignInMethods {
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  identities?: Array<{ provider?: string | null }> | null;
}

/** True when this account signs in with Apple. */
export function accountUsesAppleSignIn(authUser: SignInMethods | null | undefined): boolean {
  if (!authUser) return false;
  const providers = authUser.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes('apple')) return true;
  if (authUser.app_metadata?.provider === 'apple') return true;
  return (authUser.identities ?? []).some((identity) => identity.provider === 'apple');
}

/**
 * Called only once the whole account is being deleted: deleting one hat while
 * the other stays leaves an account that still signs in with Apple. iOS only,
 * the one place the app can ask Apple for a fresh code.
 */
export function shouldRevokeAppleSignIn(
  authUser: SignInMethods | null | undefined,
  platformOS: string = Platform.OS,
): boolean {
  return platformOS === 'ios' && accountUsesAppleSignIn(authUser);
}

/**
 * App Store Guideline 5.1.1(v): an account that signed in with Apple has its
 * Apple tokens revoked when it is deleted. Supabase never gives the app Apple's
 * refresh token, so this asks Apple for a one-time code and the
 * revoke-apple-sign-in function trades it in and revokes it.
 *
 * Never throws. Deleting the account must not depend on this step, so a
 * closed Apple sheet or a failed call is logged and deletion carries on.
 */
export async function revokeAppleSignInForDeletion(): Promise<void> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.authorizationCode) {
      logger.warn('[appleSignInRevocation] Apple returned no authorization code');
      return;
    }
    await revokeAppleSignIn(credential.authorizationCode);
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') {
      logger.warn('[appleSignInRevocation] Apple sheet closed; deleting without revoking');
      return;
    }
    logger.error('[appleSignInRevocation] could not revoke Apple sign-in:', err);
  }
}
