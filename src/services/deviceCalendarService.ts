/**
 * The phone's own calendar (iCloud, and any Google/Outlook account added to
 * the phone) — read for a link-only provider's diary on Home, and written to
 * when a client taps "Add to my calendar".
 *
 * Everything here stays on the device. No calendar event is ever sent to
 * CERVICED's servers, which is why the chosen calendars live in AsyncStorage
 * rather than on the provider's row.
 *
 * Uses expo-calendar's legacy API on purpose: the newer object API is a stub
 * in Expo Go, and the legacy one works in both Expo Go and a dev build.
 *
 * Paywall note: calendar sync is planned to sit behind a subscription, but
 * the product owner has it free until they switch that on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { logger } from '../utils/logger';

export type CalendarAccess = 'granted' | 'denied' | 'undetermined';

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string;
  /** e.g. "iCloud", "you@gmail.com" */
  sourceName: string;
}

export interface DiaryEvent {
  id: string;
  calendarId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  calendarColor: string;
}

function toAccess(status: string): CalendarAccess {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getCalendarAccess(): Promise<CalendarAccess> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return toAccess(status);
}

/** Shows the system prompt the first time; after a "Don't allow" the answer
 *  only changes in the phone's Settings, and this resolves 'denied'. */
export async function requestCalendarAccess(): Promise<CalendarAccess> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return toAccess(status);
}

/** Calendars that hold events (not reminder lists). Needs read access. */
export async function getDeviceCalendars(): Promise<DeviceCalendar[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter(calendar => calendar.isVisible !== false)
    .map(calendar => ({
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
      sourceName: calendar.source?.name ?? '',
    }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.title.localeCompare(b.title));
}

/** Which calendars the provider chose for their diary on this phone. Null =
 *  never chosen, i.e. calendar sync isn't connected on this device. */
export async function getDiaryCalendarIds(): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.DIARY_CALENDAR_IDS);
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export async function setDiaryCalendarIds(ids: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DIARY_CALENDAR_IDS, JSON.stringify(ids));
}

/** Disconnect: forget the choice on this phone. Permission itself can only be
 *  withdrawn in the phone's Settings. */
export async function clearDiaryCalendars(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.DIARY_CALENDAR_IDS);
}

const MAX_DIARY_EVENTS = 100;

/** Events in the chosen calendars from the start of today for `days` days,
 *  soonest first. Ids for calendars that have since been removed from the
 *  phone are dropped rather than failing the whole read. */
export async function getDiaryEvents(calendarIds: readonly string[], days: number): Promise<DiaryEvent[]> {
  if (calendarIds.length === 0) return [];
  const calendars = await getDeviceCalendars();
  const colorById = new Map(calendars.map(calendar => [calendar.id, calendar.color]));
  const ids = calendarIds.filter(id => colorById.has(id));
  if (ids.length === 0) return [];

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const events = await Calendar.getEventsAsync(ids, start, end);
  return events
    .map(event => ({
      id: event.id,
      calendarId: event.calendarId,
      title: event.title?.trim() || 'Busy',
      start: new Date(event.startDate),
      end: new Date(event.endDate),
      allDay: event.allDay,
      location: event.location ?? null,
      calendarColor: colorById.get(event.calendarId) ?? '#AF9197',
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, MAX_DIARY_EVENTS);
}

export interface AppointmentForCalendar {
  title: string;
  start: Date;
  /** Defaults to an hour after start when the length isn't known (a
   *  booked-elsewhere entry has no duration). */
  end?: Date;
  location?: string | null;
  notes?: string;
  url?: string | null;
}

/**
 * Opens the system's own "new event" sheet, pre-filled, so the client checks
 * it and picks the calendar themselves. That sheet needs no calendar
 * permission on iOS and nothing is written unless they tap Add.
 *
 * Resolves true when the event was saved (iOS). Android's sheet doesn't
 * report what the user did, so it resolves true there once the sheet closes.
 */
export async function addAppointmentToCalendar(appointment: AppointmentForCalendar): Promise<boolean> {
  const end = appointment.end ?? new Date(appointment.start.getTime() + 60 * 60 * 1000);
  const result = await Calendar.createEventInCalendarAsync({
    title: appointment.title,
    startDate: appointment.start,
    endDate: end,
    ...(appointment.location ? { location: appointment.location } : {}),
    ...(appointment.notes ? { notes: appointment.notes } : {}),
    ...(appointment.url && Platform.OS === 'ios' ? { url: appointment.url } : {}),
  });
  logger.log('[deviceCalendar] add-event sheet closed:', result.action);
  return result.action === 'saved' || result.action === 'done';
}
