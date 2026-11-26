import { bookTapRatio, lastSevenDaysOfBookTaps, sumLinkOnlyStats } from '../features/providers/linkOnlyAnalytics';

const row = (day: string, book_taps: number, profile_views = 0) => ({
  day,
  book_taps,
  profile_views,
  search_appearances: 2,
  instagram_taps: 1,
  join_nudges: 4,
});

describe('sumLinkOnlyStats', () => {
  it('adds every counter across days', () => {
    expect(sumLinkOnlyStats([row('2026-10-15', 3, 20), row('2026-10-16', 1, 5)])).toEqual({
      bookTaps: 4,
      profileViews: 25,
      searchAppearances: 4,
      instagramTaps: 2,
      joinNudges: 8,
    });
  });

  it('is all zeros with no activity', () => {
    expect(sumLinkOnlyStats([]).bookTaps).toBe(0);
  });
});

describe('lastSevenDaysOfBookTaps', () => {
  it('zero-fills quiet days and ends on today', () => {
    const bars = lastSevenDaysOfBookTaps([row('2026-10-16', 5), row('2026-10-12', 2)], new Date(2026, 9, 16, 15));
    expect(bars.map(bar => bar.ymd)).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
    ]);
    expect(bars.map(bar => bar.value)).toEqual([0, 0, 2, 0, 0, 0, 5]);
    expect(bars[6]?.letter).toBe('F');
  });
});

describe('bookTapRatio', () => {
  it('says nothing until there is enough to say', () => {
    expect(bookTapRatio({ bookTaps: 0, profileViews: 100, searchAppearances: 0, instagramTaps: 0, joinNudges: 0 })).toBeNull();
    expect(bookTapRatio({ bookTaps: 1, profileViews: 4, searchAppearances: 0, instagramTaps: 0, joinNudges: 0 })).toBeNull();
  });

  it('rounds to a whole "1 in N"', () => {
    expect(bookTapRatio({ bookTaps: 48, profileViews: 312, searchAppearances: 0, instagramTaps: 0, joinNudges: 0 })).toBe(7);
  });
});
