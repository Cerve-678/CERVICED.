import { readFileSync } from 'fs';
import { join } from 'path';
import { buildAchievementsView } from '../features/achievements/achievementPresentation';
import { en } from '../i18n/catalogs/en';
import { translate } from '../i18n/translate';
import type { TranslationKey, TranslationParams } from '../i18n/types';
import type { ProviderAchievement } from '../types/achievements';

const t = (key: TranslationKey, params?: TranslationParams): string => translate('en', key, params);

/** The items on the only shelf a test's rows produce. */
const onlyShelf = (view: ReturnType<typeof buildAchievementsView>) => {
  expect(view.shelves).toHaveLength(1);
  return view.shelves[0]!;
};

const row = (key: string, group: string, current: number, target: number, earned_on: string | null = null): ProviderAchievement => ({
  key, group, current, target, earned_on,
});

describe('achievement presentation', () => {
  it('puts earned first on a shelf and counts them', () => {
    const view = buildAchievementsView({
      average_rating: null,
      achievements: [
        row('bookings_50', 'bookings', 32, 50),
        row('booking_first', 'bookings', 32, 1, '2026-07-04'),
        row('bookings_10', 'bookings', 32, 10, '2026-08-21'),
      ],
    }, t);

    expect(view.summary).toBe('2 of 3 earned');
    const shelf = onlyShelf(view);
    expect(shelf.count).toBe('2 of 3');
    expect(shelf.items.map((item) => item.key)).toEqual(['booking_first', 'bookings_10', 'bookings_50']);
    expect(shelf.items[2]).toMatchObject({ earned: false, earnedDate: null, progress: '32 of 50', share: 0.64 });
  });

  it('picks the most recent as latest, the later one on a shared date', () => {
    const view = buildAchievementsView({
      average_rating: null,
      achievements: [
        row('live', 'established', 1, 1, '2026-03-01'),
        row('booking_first', 'bookings', 10, 1, '2026-07-04'),
        row('bookings_10', 'bookings', 10, 10, '2026-07-04'),
      ],
    }, t);
    expect(view.latest?.key).toBe('bookings_10');
    expect(view.latest?.earnedDate).toMatch(/4th July 2026/);
  });

  it('has no latest until something is earned', () => {
    const view = buildAchievementsView({ average_rating: null, achievements: [row('bookings_10', 'bookings', 1, 10)] }, t);
    expect(view.latest).toBeNull();
    expect(view.summary).toBe('0 of 1 earned');
  });

  it('writes money in pounds', () => {
    const view = buildAchievementsView({
      average_rating: null,
      achievements: [row('paid_1000', 'earnings', 64050, 100000)],
    }, t);
    expect(onlyShelf(view).items[0]?.progress).toBe('£640 of £1,000');
  });

  it('never makes a rating that falls short look finished', () => {
    const short = buildAchievementsView({ average_rating: 4.9, achievements: [row('rating_48', 'client_love', 12, 25)] }, t);
    expect(onlyShelf(short).items[0]?.progress).toBe('12 of 25 reviews');

    const enough = buildAchievementsView({ average_rating: 4.52, achievements: [row('rating_48', 'client_love', 30, 25)] }, t);
    expect(onlyShelf(enough).items[0]?.progress).toBe('Rated 4.5, needs 4.8');
    expect(onlyShelf(enough).items[0]?.share).toBeLessThan(1);
  });

  it('shows no count on one-off achievements', () => {
    const view = buildAchievementsView({ average_rating: null, achievements: [row('tip_first', 'client_love', 0, 1)] }, t);
    expect(onlyShelf(view).items[0]?.progress).toBe('');
  });

  it('skips a shelf with nothing in it, and what this build does not know', () => {
    const view = buildAchievementsView({
      average_rating: null,
      achievements: [
        row('fully_booked', 'fully_booked', 1, 1, '2026-11-01'),
        row('saves_25', 'client_love', 1, 25),
      ],
    }, t);
    expect(view.shelves.map((shelf) => shelf.key)).toEqual(['client_love']);
    expect(view.latest).toBeNull();
    expect(view.summary).toBe('0 of 1 earned');
  });

  it('knows every achievement the server can send', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261101180000_provider_achievements.sql'), 'utf8');
    const rows = [...sql.matchAll(/^\s*\(\s*\d+, '([a-z_]+)', '([a-z0-9_]+)'/gm)].map((match) => row(match[2]!, match[1]!, 0, 1));
    expect(rows).toHaveLength(27);

    const view = buildAchievementsView({ average_rating: null, achievements: rows }, t);
    expect(view.summary).toBe('0 of 27 earned');
    view.shelves.flatMap((shelf) => shelf.items).forEach((item) => {
      expect(item.name).not.toMatch(/^achievements\./);
      expect(item.how).not.toMatch(/^achievements\./);
    });
    expect(Object.keys(en).some((key) => key.startsWith('achievements.'))).toBe(true);
  });
});
