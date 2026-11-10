// src/features/bookings/useClientActivity.ts
//
// The client's Activity Centre list, for any screen that shows it or its "!":
// the Activity Centre page, the "!" on Bookings' tray button, and the client
// Settings screen's "For you" card. One hook so they can never count differently.
//
// Re-reads when the screen using it comes into focus and when the client's
// bookings change, since an intake form filled in or a refund requested
// elsewhere should be reflected the next time either screen is looked at.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useBooking } from '../../contexts/BookingContext';
import { getMyActivity, type ClientActivityRemote } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { bookingTodoCounts, buildClientActivity, type ClientActivity } from './activityCentre';

export const EMPTY_ACTIVITY_REMOTE: ClientActivityRemote = {
  pendingFormBookingIds: [], unreadPackBookingIds: [], openRefundRequests: [], feesToPay: [], waitlistHolds: [], recentlyDone: [],
};

export interface ClientActivityState {
  activity: ClientActivity;
  /** Forms + unread packs per booking still ahead: the "!" on each booking row. */
  todoCounts: Record<string, number>;
  /** False until the first read has finished, either way. */
  loaded: boolean;
  /** The last read failed; `activity` is then what it last had. */
  failed: boolean;
  refresh: () => Promise<void>;
}

export function useClientActivity(): ClientActivityState {
  const { user } = useAuth();
  const { todayBookings, upcomingBookings, pastBookings } = useBooking();
  const [remote, setRemote] = useState<ClientActivityRemote>(EMPTY_ACTIVITY_REMOTE);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Focus and a bookings change can both start a read at once. Only the
  // latest one may land: an earlier read finishing last would put back a form
  // or pack the client has just finished.
  const latestRead = useRef(0);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const read = ++latestRead.current;
    try {
      const next = await getMyActivity();
      if (read !== latestRead.current) return;
      setRemote(next);
      setFailed(false);
    } catch (error: unknown) {
      if (read !== latestRead.current) return;
      logger.warn('[Activity] activity centre failed to load', error);
      setFailed(true);
    } finally {
      if (read === latestRead.current) setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, upcomingBookings.length, pastBookings.length]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const allBookings = useMemo(() => {
    const seen = new Set<string>();
    return [...todayBookings, ...upcomingBookings, ...pastBookings].filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  }, [todayBookings, upcomingBookings, pastBookings]);
  const activity = useMemo(() => buildClientActivity(allBookings, remote), [allBookings, remote]);
  const todoCounts = useMemo(() => bookingTodoCounts(remote, allBookings), [remote, allBookings]);

  return { activity, todoCounts, loaded, failed, refresh };
}
