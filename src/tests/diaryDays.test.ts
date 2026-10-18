import { diaryEventMinutes, groupDiaryByDay } from '../features/providers/diaryDays';
import type { DiaryEvent } from '../services/deviceCalendarService';

function event(id: string, start: Date, minutes: number, allDay = false): DiaryEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    start,
    end: new Date(start.getTime() + minutes * 60000),
    allDay,
    location: null,
    calendarColor: '#000',
  };
}

describe('groupDiaryByDay', () => {
  const today = new Date(2026, 9, 19, 9, 0);

  it('groups by local start day, earliest first, skipping days before today', () => {
    const days = groupDiaryByDay(
      [
        event('tue-late', new Date(2026, 9, 20, 15, 0), 60),
        event('mon-late', new Date(2026, 9, 19, 14, 30), 105),
        event('sun', new Date(2026, 9, 18, 10, 0), 60),
        event('mon-early', new Date(2026, 9, 19, 10, 0), 210),
      ],
      today,
    );
    expect(days.map(d => d.ymd)).toEqual(['2026-10-19', '2026-10-20']);
    expect(days[0]!.events.map(e => e.id)).toEqual(['mon-early', 'mon-late']);
    expect(days[1]!.events.map(e => e.id)).toEqual(['tue-late']);
  });

  it('returns nothing for an empty diary', () => {
    expect(groupDiaryByDay([], today)).toEqual([]);
  });
});

describe('diaryEventMinutes', () => {
  it('measures a timed event and treats all-day as zero', () => {
    expect(diaryEventMinutes(event('a', new Date(2026, 9, 19, 10, 0), 210))).toBe(210);
    expect(diaryEventMinutes(event('b', new Date(2026, 9, 19), 1440, true))).toBe(0);
  });
});
