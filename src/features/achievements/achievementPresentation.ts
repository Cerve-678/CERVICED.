import type { TranslationKey, TranslationParams } from '../../i18n/types';
import type { ProviderAchievement, ProviderAchievements } from '../../types/achievements';
import { formatLongDate } from '../../utils/dateUtils';

/** Stroke paths on a 24 x 24 box, drawn inside the achievement seal. */
const ICON_PATHS = {
  booked: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8.5 14.5l2.5 2.5 4.5-4.5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  save: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0',
  pound: 'M16.5 7.5A3.6 3.6 0 0 0 9.5 9c0 3 1 4 .5 6.5S8 19 7 19h10.5M7.5 13h6.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  photo: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 8.5h.01',
  repeat: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.5 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  trend: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  award: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM8.5 14L7 21l5-3 5 3-1.5-7',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
} as const;

type Progress = 'once' | 'count' | 'money' | 'rating' | 'busyDay' | 'months' | 'slots';

interface Display {
  name: TranslationKey;
  how: TranslationKey;
  icon: keyof typeof ICON_PATHS;
  progress: Progress;
}

const DISPLAY: Record<string, Display> = {
  booking_first: { name: 'achievements.name.bookingFirst', how: 'achievements.how.bookings', icon: 'booked', progress: 'once' },
  bookings_10: { name: 'achievements.name.bookings10', how: 'achievements.how.bookings', icon: 'booked', progress: 'count' },
  bookings_50: { name: 'achievements.name.bookings50', how: 'achievements.how.bookings', icon: 'booked', progress: 'count' },
  bookings_100: { name: 'achievements.name.bookings100', how: 'achievements.how.bookings', icon: 'booked', progress: 'count' },
  bookings_500: { name: 'achievements.name.bookings500', how: 'achievements.how.bookings', icon: 'booked', progress: 'count' },
  five_star_first: { name: 'achievements.name.fiveStarFirst', how: 'achievements.how.fiveStar', icon: 'star', progress: 'once' },
  five_star_10: { name: 'achievements.name.fiveStar10', how: 'achievements.how.fiveStar', icon: 'star', progress: 'count' },
  five_star_50: { name: 'achievements.name.fiveStar50', how: 'achievements.how.fiveStar', icon: 'star', progress: 'count' },
  rating_48: { name: 'achievements.name.rating48', how: 'achievements.how.rating', icon: 'award', progress: 'rating' },
  tip_first: { name: 'achievements.name.tipFirst', how: 'achievements.how.tip', icon: 'heart', progress: 'once' },
  returning_10: { name: 'achievements.name.returning10', how: 'achievements.how.returning', icon: 'repeat', progress: 'count' },
  saves_25: { name: 'achievements.name.saves25', how: 'achievements.how.saves', icon: 'save', progress: 'count' },
  saves_100: { name: 'achievements.name.saves100', how: 'achievements.how.saves', icon: 'save', progress: 'count' },
  bell_10: { name: 'achievements.name.bell10', how: 'achievements.how.bell', icon: 'bell', progress: 'count' },
  bell_50: { name: 'achievements.name.bell50', how: 'achievements.how.bell', icon: 'bell', progress: 'count' },
  months_3: { name: 'achievements.name.months3', how: 'achievements.how.months', icon: 'trend', progress: 'count' },
  months_6: { name: 'achievements.name.months6', how: 'achievements.how.months', icon: 'trend', progress: 'count' },
  months_12: { name: 'achievements.name.months12', how: 'achievements.how.months', icon: 'trend', progress: 'count' },
  busy_day: { name: 'achievements.name.busyDay', how: 'achievements.how.busyDay', icon: 'bolt', progress: 'busyDay' },
  payout_first: { name: 'achievements.name.payoutFirst', how: 'achievements.how.paid', icon: 'pound', progress: 'once' },
  paid_1000: { name: 'achievements.name.paid1000', how: 'achievements.how.paid', icon: 'pound', progress: 'money' },
  paid_10000: { name: 'achievements.name.paid10000', how: 'achievements.how.paid', icon: 'pound', progress: 'money' },
  waitlist_hero: { name: 'achievements.name.waitlistHero', how: 'achievements.how.waitlist', icon: 'list', progress: 'slots' },
  live: { name: 'achievements.name.live', how: 'achievements.how.live', icon: 'spark', progress: 'once' },
  photos_20: { name: 'achievements.name.photos20', how: 'achievements.how.photos', icon: 'photo', progress: 'count' },
  months_on_6: { name: 'achievements.name.monthsOn6', how: 'achievements.how.monthsOn', icon: 'clock', progress: 'months' },
  months_on_12: { name: 'achievements.name.monthsOn12', how: 'achievements.how.monthsOn', icon: 'clock', progress: 'months' },
};

const GROUPS: readonly { key: string; title: TranslationKey }[] = [
  { key: 'bookings', title: 'achievements.group.bookings' },
  { key: 'client_love', title: 'achievements.group.clientLove' },
  { key: 'busy', title: 'achievements.group.busy' },
  { key: 'earnings', title: 'achievements.group.earnings' },
  { key: 'waitlist', title: 'achievements.group.waitlist' },
  { key: 'established', title: 'achievements.group.established' },
];

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

export interface AchievementItem {
  key: string;
  name: string;
  how: string;
  iconPath: string;
  earned: boolean;
  /** "Sunday 1st November 2026" once earned. */
  earnedDate: string | null;
  /** "32 of 50", empty when there's nothing to count. */
  progress: string;
  /** 0 to 1, how much of the seal's ring to fill. */
  share: number;
}

export interface AchievementShelf {
  key: string;
  title: string;
  count: string;
  items: AchievementItem[];
}

export interface AchievementsView {
  summary: string;
  latest: AchievementItem | null;
  shelves: AchievementShelf[];
}

const pounds = (pence: number): string => `£${Math.floor(pence / 100).toLocaleString('en-GB')}`;

function progressLabel(row: ProviderAchievement, kind: Progress, averageRating: number | null, t: Translate): string {
  const { current, target } = row;
  switch (kind) {
    case 'once':
      return '';
    case 'money':
      return t('achievements.progress.count', { current: pounds(current), target: pounds(target) });
    case 'busyDay':
      return t('achievements.progress.busyDay', { current, target });
    case 'months':
      return t('achievements.progress.months', { current, target });
    case 'slots':
      return t('achievements.progress.slots', { current, target });
    case 'rating':
      // Enough reviews but not the rating: "25 of 25 reviews" would read as done.
      return current >= target && averageRating !== null
        ? t('achievements.progress.ratingShort', { rating: averageRating.toFixed(1) })
        : t('achievements.progress.reviews', { current, target });
    case 'count':
      return t('achievements.progress.count', { current, target });
  }
}

function toItem(row: ProviderAchievement, averageRating: number | null, t: Translate): AchievementItem {
  // Only called for rows buildAchievementsView has already matched to DISPLAY.
  const display = DISPLAY[row.key] as Display;
  const earned = row.earned_on !== null;
  return {
    key: row.key,
    name: t(display.name),
    how: t(display.how),
    iconPath: ICON_PATHS[display.icon],
    earned,
    earnedDate: row.earned_on ? formatLongDate(row.earned_on) : null,
    progress: earned ? '' : progressLabel(row, display.progress, averageRating, t),
    // A met count with no award yet (the rating case) stops short of a closed ring.
    share: earned ? 1 : Math.min(row.target > 0 ? row.current / row.target : 0, 0.97),
  };
}

/** Earned first on each shelf, keeping the server's order within each. Keys this
 *  build doesn't know are skipped, so the server can add an achievement without
 *  breaking an older app. */
export function buildAchievementsView(data: ProviderAchievements, t: Translate): AchievementsView {
  const shown = data.achievements.filter((row) => DISPLAY[row.key] && GROUPS.some((group) => group.key === row.group));

  const shelves = GROUPS.flatMap((group): AchievementShelf[] => {
    const rows = shown.filter((row) => row.group === group.key);
    if (rows.length === 0) return [];
    const earned = rows.filter((row) => row.earned_on !== null);
    const locked = rows.filter((row) => row.earned_on === null);
    return [{
      key: group.key,
      title: t(group.title),
      count: t('achievements.groupCount', { earned: earned.length, total: rows.length }),
      items: [...earned, ...locked].map((row) => toItem(row, data.average_rating, t)),
    }];
  });

  // On a shared date, the later achievement in the list is the bigger one.
  const latestRow = shown.reduce<ProviderAchievement | null>((best, row) => {
    if (row.earned_on === null) return best;
    return best === null || (best.earned_on as string) <= row.earned_on ? row : best;
  }, null);

  return {
    summary: t('achievements.summary', {
      earned: shown.filter((row) => row.earned_on !== null).length,
      total: shown.length,
    }),
    latest: latestRow ? toItem(latestRow, data.average_rating, t) : null,
    shelves,
  };
}
