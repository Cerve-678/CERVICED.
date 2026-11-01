// src/features/providers/useTodaySchedule.ts
// Loads the bookings for My Profile's two "today" cards (today and tomorrow for
// the summary, plus the next few after that for the booking cards) and keeps the clock moving while the screen is open, so "next", the done
// rows and the 2pm swap follow the time without a refresh.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getProviderBookingsByDateRange, getProviderUpcomingBookings, getServiceSafetyFlags } from '../../services/databaseService';
import type { BookingWithAddOns } from '../../types/database';
import { dateToYMD } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';
import { buildTodaySchedule, UPCOMING_CARD_COUNT, type TodaySchedule } from './todaySchedule';

const TICK_MS = 60_000;

export function useTodaySchedule(providerId: string | null): TodaySchedule<BookingWithAddOns> | null {
  const [now, setNow] = useState(() => new Date());
  const [bookings, setBookings] = useState<BookingWithAddOns[] | null>(null);
  const [patchTestServiceIds, setPatchTestServiceIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeRef = useRef(true);

  const todayYmd = dateToYMD(now);
  const tomorrowYmd = useMemo(() => {
    const next = new Date(`${todayYmd}T12:00:00`);
    next.setDate(next.getDate() + 1);
    return dateToYMD(next);
  }, [todayYmd]);

  // Keyed on the date, so the clock passing midnight refetches the new day.
  const load = useCallback(async () => {
    if (!providerId) return;
    try {
      const afterTomorrow = new Date(`${tomorrowYmd}T12:00:00`);
      afterTomorrow.setDate(afterTomorrow.getDate() + 1);
      const [nearRows, laterRows] = await Promise.all([
        getProviderBookingsByDateRange(providerId, todayYmd, tomorrowYmd),
        getProviderUpcomingBookings(providerId, dateToYMD(afterTomorrow), UPCOMING_CARD_COUNT),
      ]);
      const rows = [...nearRows, ...laterRows];
      const flags = await getServiceSafetyFlags(
        rows.map(b => b.service_id).filter((id): id is string => !!id),
      );
      if (!activeRef.current) return;
      setBookings(rows);
      setPatchTestServiceIds(
        new Set([...flags].filter(([, f]) => f.patchTestRequired).map(([id]) => id)),
      );
    } catch (error) {
      // The cards just stay as they were (or hidden on a first load) — the
      // rest of the dashboard doesn't depend on them.
      logger.error('[TodaySchedule] Failed to load bookings', error);
    }
  }, [providerId, todayYmd, tomorrowYmd]);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      setNow(new Date());
      void load();
      const timer = setInterval(() => setNow(new Date()), TICK_MS);
      return () => {
        activeRef.current = false;
        clearInterval(timer);
      };
    }, [load]),
  );

  return useMemo(
    () =>
      bookings
        ? buildTodaySchedule({ now, todayYmd, tomorrowYmd, bookings, patchTestServiceIds })
        : null,
    [bookings, now, todayYmd, tomorrowYmd, patchTestServiceIds],
  );
}
