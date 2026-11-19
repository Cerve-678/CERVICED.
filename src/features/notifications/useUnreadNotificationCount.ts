// The unread number on a notification bell, kept live.
//
// Refetches when the screen comes into focus AND whenever a notification for
// this hat arrives or changes while the screen is showing, so a bell you're
// looking at moves without you leaving and coming back. Tab screens stay
// mounted behind other tabs; those skip live events and just recount when
// you return to them. Counts every unread row on the server
// for the hat — the Notifications screen pages back through all of them, so
// whatever the bell says is reachable there.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { getUnreadNotificationCount, subscribeToNotificationChanges } from '../../services/databaseService';
import { logger } from '../../utils/logger';

type Hat = 'provider' | 'client';

/** "Mark all read" on 200 rows sends 200 realtime updates; one count covers them. */
const REFRESH_COALESCE_MS = 400;

export function useUnreadNotificationCount(role: Hat, enabled = true): number {
  const { user } = useAuth();
  const userId = user?.id;
  const active = enabled && !!userId;
  const [count, setCount] = useState(0);
  // Only the newest request may set the number, so a slow earlier reply
  // can't overwrite a fresher one.
  const requestSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);

  const refresh = useCallback(() => {
    const seq = ++requestSeq.current;
    if (!active) { setCount(0); return; }
    getUnreadNotificationCount(role)
      .then(value => { if (seq === requestSeq.current) setCount(value); })
      .catch(err => logger.error(`[useUnreadNotificationCount] ${role} count failed:`, err));
  }, [active, role]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    refresh();
    return () => { focused.current = false; };
  }, [refresh]));

  useEffect(() => {
    if (!active || !userId) return;
    const scheduleRefresh = (row: { recipient_role?: string | null }) => {
      if (row.recipient_role !== role || !focused.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; refresh(); }, REFRESH_COALESCE_MS);
    };
    const unsubscribe = subscribeToNotificationChanges(userId, scheduleRefresh, scheduleRefresh);
    return () => {
      unsubscribe();
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      // Anything still in flight belongs to the old user/hat.
      requestSeq.current++;
    };
  }, [active, userId, role, refresh]);

  return count;
}
