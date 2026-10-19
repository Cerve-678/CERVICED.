/**
 * A link-only provider's diary as the Dashboard shows it: today and the six
 * days after, every day listed (free and closed days too). Pure, so the day bucketing is testable
 * without the phone's calendar. Days are local calendar days, matching what the phone shows.
 */
import type { DiaryEvent } from '../../services/deviceCalendarService';
import type { DbProviderAvailability } from '../../types/database';
import { dateToYMD } from '../../utils/dateUtils';

export const DASHBOARD_WEEK_DAYS = 7;

export interface DashboardWeekDay {
  ymd: string;
  /** Local midnight of that day. */
  date: Date;
  events: DiaryEvent[];
  /** Closed in their weekly opening hours. False when hours aren't known. */
  closed: boolean;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** That weekday's row in their weekly opening hours, if any. */
export function hoursFor(hours: readonly DbProviderAvailability[], date: Date): DbProviderAvailability | undefined {
  return hours.find(row => row.day_of_week === date.getDay());
}

/** Today and the six days after it, every day present (free days included),
 *  each with the events that start on it, earliest first. */
export function buildDashboardWeek(
  events: readonly DiaryEvent[],
  hours: readonly DbProviderAvailability[],
  today: Date,
): DashboardWeekDay[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  return Array.from({ length: DASHBOARD_WEEK_DAYS }, (_, index) => {
    const date = startOfDay(today);
    date.setDate(date.getDate() + index);
    const ymd = dateToYMD(date);
    const row = hoursFor(hours, date);
    return {
      ymd,
      date,
      events: sorted.filter(event => dateToYMD(event.start) === ymd),
      closed: row ? row.is_closed : false,
    };
  });
}

/** Minutes an event runs for, or 0 for an all-day or zero-length one. */
export function diaryEventMinutes(event: DiaryEvent): number {
  if (event.allDay) return 0;
  return Math.max(0, Math.round((event.end.getTime() - event.start.getTime()) / 60000));
}
