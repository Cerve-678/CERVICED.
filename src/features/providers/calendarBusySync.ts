// src/features/providers/calendarBusySync.ts
// Calendar sync for full providers: the calendars they chose on this phone
// (Scheduling & Availability → Calendar sync) are read and their busy times
// sent to CERVICED, so clients can't book a time the provider is already
// taking a booking elsewhere (Fresha, Booksy, Acuity, a DM...).
//
// It runs when the provider opens Home or comes back to the app, and when they
// tap Sync now. So the blocks are as fresh as their last visit; the settings
// card says when that was. Link-only providers never sync: they take no
// bookings here, and their diary promises nothing leaves the phone.
//
// Free for now. Calendar sync is planned to sit behind a subscription once
// the product owner switches that on (see deviceCalendarService).
import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getBusyEvents, getCalendarAccess, getDiaryCalendarIds } from '../../services/deviceCalendarService';
import { syncMyCalendarBusyBlocks } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { addDaysYmd, toUkBusyBlocks, ukTodayYmd } from './calendarBusyBlocks';

/** How far ahead busy times are synced. Past any booking window a provider
 *  can pick, and inside the server's 400-day limit. */
export const CALENDAR_SYNC_DAYS = 366;

/** Automatic syncs (Home, coming back to the app) at most this often. */
const AUTO_SYNC_GAP_MS = 5 * 60_000;

export type CalendarSyncResult =
  | { outcome: 'synced'; blockCount: number }
  /** No calendars chosen on this phone. */
  | { outcome: 'not_connected' }
  /** Calendars chosen, but the phone's calendar permission is off. */
  | { outcome: 'no_access' }
  /** An automatic sync ran a moment ago. */
  | { outcome: 'skipped' };

let lastSyncedAt = 0;
let inFlight: Promise<CalendarSyncResult> | null = null;

async function runSync(): Promise<CalendarSyncResult> {
  const ids = await getDiaryCalendarIds();
  if (ids == null || ids.length === 0) return { outcome: 'not_connected' };
  if ((await getCalendarAccess()) !== 'granted') return { outcome: 'no_access' };

  const fromYmd = ukTodayYmd();
  const toYmd = addDaysYmd(fromYmd, CALENDAR_SYNC_DAYS);
  // A day either side of the UK range, so a phone in another timezone still
  // reads every event that touches it; toUkBusyBlocks trims to the range.
  const readFrom = new Date(Date.now() - 24 * 60 * 60_000);
  const readTo = new Date(Date.now() + (CALENDAR_SYNC_DAYS + 2) * 24 * 60 * 60_000);
  const events = await getBusyEvents(ids, readFrom, readTo);
  const blocks = toUkBusyBlocks(events, fromYmd, toYmd);

  const { blockCount } = await syncMyCalendarBusyBlocks(fromYmd, toYmd, blocks);
  lastSyncedAt = Date.now();
  return { outcome: 'synced', blockCount };
}

/**
 * Sync now. `force` (Sync now, a new calendar choice) always runs; otherwise
 * it skips when the last sync was under five minutes ago. Concurrent calls
 * share one run. Throws when the phone or the server fails; callers decide
 * whether to show that.
 */
export function syncCalendarBusyTimes({ force = false }: { force?: boolean } = {}): Promise<CalendarSyncResult> {
  // A forced sync after a new calendar choice must read the new choice, so it
  // waits for a run already going rather than sharing its result.
  if (inFlight) {
    return force
      ? inFlight.catch(() => undefined).then(() => syncCalendarBusyTimes({ force: true }))
      : inFlight;
  }
  if (!force && Date.now() - lastSyncedAt < AUTO_SYNC_GAP_MS) {
    return Promise.resolve({ outcome: 'skipped' });
  }
  inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

/** After a disconnect, so the next connect syncs straight away. */
export function resetCalendarSyncThrottle(): void {
  lastSyncedAt = 0;
}

/** A full provider's Home: sync while it's on screen, and again whenever
 *  the app comes back to the front (after they've taken a booking in their
 *  other app, say). Silent; failures are logged, and the settings card shows
 *  the last sync time. */
export function useAutoCalendarSync(): void {
  useFocusEffect(useCallback(() => {
    const run = () => {
      syncCalendarBusyTimes().catch(error => logger.warn('[calendarSync] automatic sync failed', error));
    };
    run();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, []));
}
