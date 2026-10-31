import { useEffect, useState } from 'react';
import { isCervicedAdmin } from '../../services/databaseService';
import { logger } from '../../utils/logger';

/**
 * Whether the signed-in account is a CERVICED admin, for showing the hidden
 * Money (admin) settings row. False until the server says otherwise, and on
 * any error: the row is a convenience, and the server refuses non-admins
 * everything on that screen regardless.
 */
export function useIsCervicedAdmin(userId: string | null | undefined): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(false);
    if (!userId) return undefined;
    let active = true;
    isCervicedAdmin()
      .then(result => { if (active) setIsAdmin(result); })
      .catch(err => logger.error('[useIsCervicedAdmin] check failed:', err));
    return () => { active = false; };
  }, [userId]);
  return isAdmin;
}
