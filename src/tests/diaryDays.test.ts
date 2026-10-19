import { buildDashboardWeek, diaryEventMinutes } from '../features/providers/diaryDays';
import type { DiaryEvent } from '../services/deviceCalendarService';
import type { DbProviderAvailability } from '../types/database';

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

// Monday 19 Oct 2026. Open Mon–Sat 9–6, closed Sunday.
const hours: DbProviderAvailability[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  id: `h${day}`,
  provider_id: 'p',
  day_of_week: day,
  open_time: '09:00:00',
  close_time: '18:00:00',
  is_closed: day === 0,
}));

describe('buildDashboardWeek', () => {
  const today = new Date(2026, 9, 19, 9, 0);

  it('lists today and the next six days, free days included, events earliest first', () => {
    const week = buildDashboardWeek(
      [
        event('tue-late', new Date(2026, 9, 20, 15, 0), 60),
        event('mon-late', new Date(2026, 9, 19, 14, 30), 105),
        event('sun-before', new Date(2026, 9, 18, 10, 0), 60),
        event('mon-early', new Date(2026, 9, 19, 10, 0), 210),
      ],
      hours,
      today,
    );
    expect(week.map(d => d.ymd)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(week[0]!.events.map(e => e.id)).toEqual(['mon-early', 'mon-late']);
    expect(week[1]!.events.map(e => e.id)).toEqual(['tue-late']);
    expect(week[2]!.events).toEqual([]);
    expect(week.map(d => d.closed)).toEqual([false, false, false, false, false, false, true]);
  });

  it('marks nothing closed when hours are unknown', () => {
    expect(buildDashboardWeek([], [], today).some(d => d.closed)).toBe(false);
  });
});

describe('diaryEventMinutes', () => {
  it('measures a timed event and treats all-day as zero', () => {
    expect(diaryEventMinutes(event('a', new Date(2026, 9, 19, 10, 0), 210))).toBe(210);
    expect(diaryEventMinutes(event('b', new Date(2026, 9, 19), 1440, true))).toBe(0);
  });
});
