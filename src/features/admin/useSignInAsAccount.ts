import { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { signInWithEmailPassword } from '../../services/databaseService';
import { logger } from '../../utils/logger';

/**
 * Signs the admin out of their own account and into another one they hold the
 * login for at that moment: an account they've just created, or a blank
 * provider account (whose password the server has just reset).
 *
 * logout() takes the calling screen away with the rest of the signed-in app,
 * so callers must not touch their own state after this resolves. If the
 * sign-in fails, the admin is left on the sign-in screen.
 */
export function useSignInAsAccount(): (email: string, password: string) => Promise<void> {
  const { logout } = useAuth();
  return useCallback(async (email: string, password: string) => {
    await logout();
    try {
      await signInWithEmailPassword(email, password);
    } catch (err) {
      logger.error('[useSignInAsAccount] signing in as the other account failed:', err);
    }
  }, [logout]);
}
