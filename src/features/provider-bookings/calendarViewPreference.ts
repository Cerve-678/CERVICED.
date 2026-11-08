// src/features/provider-bookings/calendarViewPreference.ts
//
// Which view the provider's Home calendar opens in: List, Full day (the
// timeline) or Week. One saved value per account, on this device, the way the
// display settings are. Both places that change it write here: the view
// button on Home and the Calendar view choice under My Profile → Manage. They
// can't disagree, and Home follows a change made in My Profile straight away.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../utils/logger';
import { STORAGE_KEYS } from '../../utils/storageKeys';

export type CalendarView = 'list' | 'timeline' | 'week';

export const DEFAULT_CALENDAR_VIEW: CalendarView = 'timeline';

/** In the order the Home button cycles through them. */
export const CALENDAR_VIEW_OPTIONS: readonly { key: CalendarView; label: string; icon: 'list-outline' | 'time-outline' | 'calendar-outline' }[] = [
  { key: 'timeline', label: 'Full day', icon: 'time-outline' },
  { key: 'list', label: 'List', icon: 'list-outline' },
  { key: 'week', label: 'Week', icon: 'calendar-outline' },
];

const STORAGE_KEY = STORAGE_KEYS.PROVIDER_CALENDAR_VIEW;

export function parseCalendarView(value: unknown): CalendarView {
  return value === 'list' || value === 'timeline' || value === 'week' ? value : DEFAULT_CALENDAR_VIEW;
}

/** The view after `view` when the Home button is tapped. */
export function nextCalendarView(view: CalendarView): CalendarView {
  const i = CALENDAR_VIEW_OPTIONS.findIndex(o => o.key === view);
  return CALENDAR_VIEW_OPTIONS[(i + 1) % CALENDAR_VIEW_OPTIONS.length]!.key;
}

// Latest value per account this session, so a second screen mounting doesn't
// wait on storage, and listeners so an open screen hears a change.
const cache = new Map<string, CalendarView>();
const listeners = new Set<(userId: string, view: CalendarView) => void>();

export async function loadCalendarView(userId: string): Promise<CalendarView> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const view = parseCalendarView(await AsyncStorage.getItem(`${STORAGE_KEY}:${userId}`));
  cache.set(userId, view);
  return view;
}

export async function saveCalendarView(userId: string, view: CalendarView): Promise<void> {
  cache.set(userId, view);
  listeners.forEach(fn => fn(userId, view));
  await AsyncStorage.setItem(`${STORAGE_KEY}:${userId}`, view);
}

/** The saved view (null until it has loaded) and a setter that saves it. */
export function useCalendarViewPreference(userId: string | null | undefined): [CalendarView | null, (view: CalendarView) => void] {
  const [view, setView] = useState<CalendarView | null>(() => (userId ? cache.get(userId) ?? null : null));

  useEffect(() => {
    if (!userId) {
      setView(null);
      return;
    }
    let active = true;
    loadCalendarView(userId)
      .then(v => { if (active) setView(v); })
      .catch((error: unknown) => {
        logger.warn('[CalendarView] load failed, using the default', error);
        if (active) setView(DEFAULT_CALENDAR_VIEW);
      });
    const listener = (changedFor: string, v: CalendarView) => {
      if (changedFor === userId) setView(v);
    };
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, [userId]);

  const save = useCallback((next: CalendarView) => {
    if (!userId) return;
    saveCalendarView(userId, next).catch((error: unknown) => {
      logger.warn('[CalendarView] save failed', error);
    });
  }, [userId]);

  return [view, save];
}
