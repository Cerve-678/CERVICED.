import { useEffect, useState } from 'react';
import { isCervicedAdmin } from '../../services/databaseService';
import { logger } from '../../utils/logger';

export type CervicedAdminStatus = 'checking' | 'admin' | 'not_admin';

/**
 * Whether the signed-in account is a CERVICED admin (admin_users), asked of
 * the server each time the account changes. 'not_admin' on any error, so a
 * failed check hides admin things rather than showing them.
 */
export function useCervicedAdminStatus(userId: string | null | undefined): CervicedAdminStatus {
  const [status, setStatus] = useState<CervicedAdminStatus>(userId ? 'checking' : 'not_admin');
  useEffect(() => {
    if (!userId) {
      setStatus('not_admin');
      return undefined;
    }
    setStatus('checking');
    let active = true;
    isCervicedAdmin()
      .then(result => { if (active) setStatus(result ? 'admin' : 'not_admin'); })
      .catch(err => {
        logger.error('[useCervicedAdminStatus] check failed:', err);
        if (active) setStatus('not_admin');
      });
    return () => { active = false; };
  }, [userId]);
  return status;
}

/**
 * For showing the hidden Admin settings row. False until the server says
 * otherwise: the row is a convenience, and the server refuses non-admins
 * everything behind it regardless.
 */
export function useIsCervicedAdmin(userId: string | null | undefined): boolean {
  return useCervicedAdminStatus(userId) === 'admin';
}
