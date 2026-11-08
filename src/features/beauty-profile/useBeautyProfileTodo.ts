// src/features/beauty-profile/useBeautyProfileTodo.ts
//
// The red "!" on the Profile tab's Beauty Profile row. Re-reads the saved
// answers on every focus (the tab screen never unmounts), so the mark goes
// the moment the client comes back from filling them in. The date of birth
// comes from AuthContext, which ProfileInfo's save updates directly.
//
// The rule itself is beautyProfileTodo — the same one Beauty Profile's own
// "still to fill in" card uses. A failed read contributes no beauty items
// rather than a wrong mark; it is logged, not surfaced.

import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { getUserBeautyProfile } from '../../services/databaseService';
import type { BeautyData } from '../../types/beautyProfile';
import { beautyProfileTodo, type BeautyTodoItem } from '../../utils/beautyProfileTodo';
import { logger } from '../../utils/logger';
import { beautyDataFromRow } from './profileRow';

export function useBeautyProfileTodo(enabled: boolean): BeautyTodoItem[] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keyed by owner so a previous account's answers never count for the next.
  const [read, setRead] = useState<{ userId: string; data: BeautyData } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!enabled || !userId) { setRead(null); return; }
    let cancelled = false;
    getUserBeautyProfile(userId)
      .then(row => { if (!cancelled) setRead({ userId, data: beautyDataFromRow(row) }); })
      .catch(err => {
        if (cancelled) return;
        logger.warn('[BeautyProfile] to-do read failed:', err);
        setRead(null);
      });
    return () => { cancelled = true; };
  }, [enabled, userId]));

  const dob = user?.dob;
  const hasClientProfile = user?.hasClientProfile;
  return useMemo(() => {
    if (!enabled || !userId) return [];
    const profile = read && read.userId === userId ? read.data : null;
    return beautyProfileTodo(profile, { dob, hasClientProfile });
  }, [enabled, userId, read, dob, hasClientProfile]);
}
