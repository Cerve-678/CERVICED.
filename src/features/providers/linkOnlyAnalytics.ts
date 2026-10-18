/**
 * Link-only Analytics — totals and the Book-taps bar series, from the
 * per-day counters in provider_daily_stats. Pure, so the period maths is
 * testable without the screen. Days with no activity have no row and count
 * as zero. Dates are UK calendar days (the server buckets by Europe/London).
 */
import type { DbProviderDailyStat } from '../../types/database';
import { DAY_NAMES_ABBREV, dateToYMD } from '../../utils/dateUtils';

export type LinkOnlyPeriod = '7d' | '30d' | 'all';

/** How many days each period asks the server for. "All time" is capped at ten
 *  years, the same cap the RPC applies. */
export const LINK_ONLY_PERIOD_DAYS: Record<LinkOnlyPeriod, number> = {
  '7d': 7,
  '30d': 30,
  all: 3650,
};

export interface LinkOnlyTotals {
  bookTaps: number;
  profileViews: number;
  searchAppearances: number;
  instagramTaps: number;
}

export function sumLinkOnlyStats(rows: readonly DbProviderDailyStat[]): LinkOnlyTotals {
  return rows.reduce<LinkOnlyTotals>(
    (acc, row) => ({
      bookTaps: acc.bookTaps + row.book_taps,
      profileViews: acc.profileViews + row.profile_views,
      searchAppearances: acc.searchAppearances + row.search_appearances,
      instagramTaps: acc.instagramTaps + row.instagram_taps,
    }),
    { bookTaps: 0, profileViews: 0, searchAppearances: 0, instagramTaps: 0 },
  );
}

export interface DayBar {
  ymd: string;
  /** One-letter weekday, e.g. "M". */
  letter: string;
  value: number;
}

/** The last seven days ending today, oldest first, zero-filled. */
export function lastSevenDaysOfBookTaps(rows: readonly DbProviderDailyStat[], today: Date): DayBar[] {
  const byDay = new Map(rows.map(row => [row.day, row.book_taps]));
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - index));
    const ymd = dateToYMD(d);
    return { ymd, letter: (DAY_NAMES_ABBREV[d.getDay()] ?? '').charAt(0), value: byDay.get(ymd) ?? 0 };
  });
}

/** "1 in 7" — how many profile viewers tap Book. Null until there's enough
 *  to say anything (at least one tap and ten views). */
export function bookTapRatio(totals: LinkOnlyTotals): number | null {
  if (totals.bookTaps === 0 || totals.profileViews < 10) return null;
  return Math.max(1, Math.round(totals.profileViews / totals.bookTaps));
}
