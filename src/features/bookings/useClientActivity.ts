// src/features/bookings/useClientActivity.ts
//
// The client's Activity Centre list, for any screen that shows it or its "!":
// the Activity Centre page, the "!" on Bookings' tray button, and the client
// Settings screen's "For you" card. One hook so they can never count differently.
//
// Re-reads when the screen using it comes into focus and when the client's
// bookings change, since an intake form filled in or a refund requested
// elsewhere should be reflected the next time either screen is looked at.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useBooking } from '../../contexts/BookingContext';
import { getMyActivity, type ClientActivityRemote } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { buildClientActivity, type ClientActivity } from './activityCentre';

export const EMPTY_ACTIVITY_REMOTE: ClientActivityRemote = {
  pendingFormBookingIds: [], unreadPackBookingIds: [], openRefundRequests: [], feesToPay: [], waitlistHolds: [],
};

export interface ClientActivityState {
  activity: ClientActivity;
  /** The raw reads, for the per-booking "!" (bookingTodoCounts). */
  remote: ClientActivityRemote;
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

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      setRemote(await getMyActivity());
      setFailed(false);
    } catch (error: unknown) {
      logger.warn('[Activity] activity centre failed to load', error);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, upcomingBookings.length, pastBookings.length]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const activity = useMemo(() => {
    const seen = new Set<string>();
    const all = [...todayBookings, ...upcomingBookings, ...pastBookings].filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
    return buildClientActivity(all, remote);
  }, [todayBookings, upcomingBookings, pastBookings, remote]);

  return { activity, remote, loaded, failed, refresh };
}
