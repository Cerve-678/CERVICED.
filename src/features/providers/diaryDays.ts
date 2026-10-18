/**
 * A link-only provider's diary, grouped into days for DiaryCard's Today and
 * Week views. Pure, so the day bucketing is testable without the phone's
 * calendar. Days are local calendar days, matching what the phone shows.
 */
import type { DiaryEvent } from '../../services/deviceCalendarService';
import { dateToYMD } from '../../utils/dateUtils';

export interface DiaryDay {
  ymd: string;
  /** Local midnight of that day. */
  date: Date;
  events: DiaryEvent[];
}

/** Events grouped by the day they start, earliest first, from `today`
 *  onwards. Days with nothing in them are left out. */
export function groupDiaryByDay(events: readonly DiaryEvent[], today: Date): DiaryDay[] {
  const todayYmd = dateToYMD(today);
  const byDay = new Map<string, DiaryDay>();
  for (const event of [...events].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const ymd = dateToYMD(event.start);
    if (ymd < todayYmd) continue;
    let day = byDay.get(ymd);
    if (!day) {
      const date = new Date(event.start);
      date.setHours(0, 0, 0, 0);
      day = { ymd, date, events: [] };
      byDay.set(ymd, day);
    }
    day.events.push(event);
  }
  return [...byDay.values()].sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
}

/** Minutes an event runs for, or 0 for an all-day or zero-length one. */
export function diaryEventMinutes(event: DiaryEvent): number {
  if (event.allDay) return 0;
  return Math.max(0, Math.round((event.end.getTime() - event.start.getTime()) / 60000));
}
