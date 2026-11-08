import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_CALENDAR_VIEW,
  loadCalendarView,
  nextCalendarView,
  parseCalendarView,
  saveCalendarView,
} from '../features/provider-bookings/calendarViewPreference';
import { describeReleaseQuickView } from '../features/providers/releaseQuickView';

describe('calendar view preference', () => {
  it('reads only the three views, defaulting to the full-day timeline', () => {
    expect(parseCalendarView('week')).toBe('week');
    expect(parseCalendarView('month')).toBe(DEFAULT_CALENDAR_VIEW);
    expect(parseCalendarView(null)).toBe('timeline');
  });

  it('cycles in the order the Home button always has: full day, list, week', () => {
    expect(nextCalendarView('timeline')).toBe('list');
    expect(nextCalendarView('list')).toBe('week');
    expect(nextCalendarView('week')).toBe('timeline');
  });

  it('keeps each account to its own choice', async () => {
    await saveCalendarView('provider-a', 'week');
    await saveCalendarView('provider-b', 'list');
    expect(await loadCalendarView('provider-a')).toBe('week');
    expect(await loadCalendarView('provider-b')).toBe('list');
    expect(await AsyncStorage.getItem('@cerviced_provider_calendar_view:provider-a')).toBe('week');
  });
});

describe('describeReleaseQuickView', () => {
  // 8 Nov 2026, after the 1st's 09:00 UTC release: December is open.
  const now = new Date(2026, 10, 8, 12, 0);

  it('gives the release day, how far clients can book and when the next month opens', () => {
    const view = describeReleaseQuickView({ schedule_release_day: 1, booking_window_days: 60 }, now);
    expect(view.title).toBe('Release day: the 1st of every month');
    expect(view.lines).toEqual(['Clients can book up to Thu 31 Dec', 'Next month opens Tue 1 Dec at 09:00am']);
  });

  it('says plainly when there is no release day', () => {
    expect(describeReleaseQuickView({ schedule_release_day: null, booking_window_days: 30 }, now)).toEqual({
      title: 'No release day: 30 days ahead',
      lines: ['Clients can book up to Tue 8 Dec', 'This moves forward one day every day'],
    });
    expect(describeReleaseQuickView({ schedule_release_day: null, booking_window_days: 0 }, now)).toEqual({
      title: 'No release day',
      lines: ['Clients can book any date in the future'],
    });
  });
});
