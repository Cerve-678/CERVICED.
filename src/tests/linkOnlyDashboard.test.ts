import {
  buildProfileStrength,
  busiestBookTapLine,
  compareWeeks,
  greetingFor,
  todayHoursLabel,
  trendLabel,
} from '../features/providers/linkOnlyDashboard';
import type { DbProviderAvailability } from '../types/database';

const monday = new Date(2026, 9, 19, 9, 0);

const hour = (day: number, open: string, close: string, closed = false): DbProviderAvailability => ({
  id: `h${day}`,
  provider_id: 'p',
  day_of_week: day,
  open_time: open,
  close_time: close,
  is_closed: closed,
});

describe('todayHoursLabel', () => {
  it('shows today\'s hours compactly', () => {
    expect(todayHoursLabel([hour(1, '09:00:00', '17:30:00')], monday)).toBe('Open today · 9am–5:30pm');
  });

  it('says closed, or nothing when today has no hours', () => {
    expect(todayHoursLabel([hour(1, '09:00:00', '17:00:00', true)], monday)).toBe('Closed today');
    expect(todayHoursLabel([hour(2, '09:00:00', '17:00:00')], monday)).toBeNull();
  });
});

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(new Date(2026, 9, 19, 8))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 9, 19, 13))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 9, 19, 20))).toBe('Good evening');
  });
});

const stat = (day: string, book_taps: number, profile_views = 0) => ({
  day,
  book_taps,
  profile_views,
  search_appearances: 0,
  instagram_taps: 0,
});

describe('compareWeeks', () => {
  it('splits 14 days into the last seven (ending today) and the seven before', () => {
    const { thisWeek, lastWeek } = compareWeeks(
      [stat('2026-10-19', 2, 10), stat('2026-10-13', 3), stat('2026-10-12', 5, 4), stat('2026-10-06', 1)],
      monday,
    );
    expect(thisWeek.bookTaps).toBe(5);
    expect(thisWeek.profileViews).toBe(10);
    expect(lastWeek.bookTaps).toBe(6);
    expect(lastWeek.profileViews).toBe(4);
  });
});

describe('trendLabel', () => {
  it('shows the change, or nothing when flat', () => {
    expect(trendLabel(14, 10)).toEqual({ text: '▲ 4', up: true });
    expect(trendLabel(131, 140)).toEqual({ text: '▼ 9', up: false });
    expect(trendLabel(3, 3)).toBeNull();
  });
});

const bar = (ymd: string, value: number) => ({ ymd, letter: 'X', value });

describe('busiestBookTapLine', () => {
  it('names the one day that led', () => {
    const bars = [bar('2026-10-13', 1), bar('2026-10-17', 5), bar('2026-10-19', 2)];
    expect(busiestBookTapLine(bars, monday)).toBe('Saturday brought you the most Book taps: 5 of your 8 this week.');
  });

  it('says Today when today led', () => {
    expect(busiestBookTapLine([bar('2026-10-18', 1), bar('2026-10-19', 3)], monday)).toBe(
      'Today brought you the most Book taps: 3 of your 4 this week.',
    );
  });

  it('stays quiet on a tie or too few taps', () => {
    expect(busiestBookTapLine([bar('2026-10-17', 2), bar('2026-10-18', 2)], monday)).toBeNull();
    expect(busiestBookTapLine([bar('2026-10-17', 2)], monday)).toBeNull();
  });
});

describe('buildProfileStrength', () => {
  const base = {
    logoSet: true,
    aboutSet: true,
    hoursSet: true,
    portfolioCount: 6,
    specialityCount: 0,
    instagram: null,
    policiesSet: false,
    accessibilityNotes: 'Step-free access',
    paymentMethods: ['card'],
  };

  it('counts go-live steps and extras together', () => {
    const { items, percent } = buildProfileStrength(base);
    expect(items.filter(i => !i.done).map(i => i.key)).toEqual(['specialities', 'instagram', 'policies', 'photos']);
    expect(percent).toBe(56);
    expect(items.find(i => i.key === 'photos')!.label).toBe('Add 3 more photos');
  });

  it('asks for a preferred payment method when none is stated', () => {
    const item = buildProfileStrength({ ...base, paymentMethods: [] }).items.find(i => i.key === 'payments')!;
    expect(item.done).toBe(false);
    expect(item.label).toBe('State preferred payment method');
  });

  it('is 100% when everything is filled in', () => {
    const full = { ...base, portfolioCount: 12, specialityCount: 2, instagram: '@ellie', policiesSet: true };
    expect(buildProfileStrength(full).percent).toBe(100);
  });

  it('treats blank text as missing', () => {
    const { items } = buildProfileStrength({ ...base, instagram: '  ', accessibilityNotes: '' });
    expect(items.find(i => i.key === 'instagram')!.done).toBe(false);
    expect(items.find(i => i.key === 'accessibility')!.done).toBe(false);
  });
});
