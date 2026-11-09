import {
  ASK_GAP_DAYS,
  canAskOnHome,
  EMPTY_MEMORY,
  INTRO_GAP_DAYS,
  NOT_NOW_LIMIT,
  nextCircleStep,
  parseMomentsMemory,
  RECOMMEND_WINDOW_DAYS,
  recommendCandidates,
  shouldShowWhereIGoNotice,
  visitWhenLabel,
  withAnswer,
  withAsked,
  withIntroShown,
  type CompletedBookingLike,
  type MomentsMemory,
} from '../features/social/circleMoments';
import {
  personAction,
  withMyStatus,
  withoutPerson,
  withPersonFirst,
} from '../features/social/people';
import type { PersonListEntry } from '../features/social/types';

const NOW = new Date(2026, 10, 8, 15, 0); // 8 Nov 2026, local

const booking = (over: Partial<CompletedBookingLike>): CompletedBookingLike => ({
  id: 'b1',
  providerId: 'p1',
  providerName: 'Glow Studio',
  bookingDate: '2026-11-07',
  status: 'completed',
  ...over,
});

const on = { showWhereIGo: true, whereIGoNoticeSeen: true };

describe('personAction', () => {
  it('reads my follow first, then theirs', () => {
    expect(personAction({ myStatus: null, followsMe: null })).toBe('follow');
    expect(personAction({ myStatus: null, followsMe: 'accepted' })).toBe('followBack');
    // Their pending request to me isn't a reason to say "Follow back" yet.
    expect(personAction({ myStatus: null, followsMe: 'pending' })).toBe('follow');
    expect(personAction({ myStatus: 'pending', followsMe: 'accepted' })).toBe('requested');
    expect(personAction({ myStatus: 'accepted', followsMe: null })).toBe('following');
  });
});

describe('list updates', () => {
  const entry = (userId: string): PersonListEntry => ({
    userId, name: userId, avatarUrl: null, status: 'accepted', since: '2026-11-08T00:00:00Z',
  });

  it('sets my status on one person only', () => {
    const out = withMyStatus(
      [{ userId: 'a', myStatus: null }, { userId: 'b', myStatus: null }],
      'b',
      'pending',
    );
    expect(out).toEqual([{ userId: 'a', myStatus: null }, { userId: 'b', myStatus: 'pending' }]);
  });

  it('removes a person', () => {
    expect(withoutPerson([entry('a'), entry('b')], 'a').map((p) => p.userId)).toEqual(['b']);
  });

  it('puts a person first without duplicating them', () => {
    const out = withPersonFirst([entry('a'), entry('b')], entry('b'));
    expect(out.map((p) => p.userId)).toEqual(['b', 'a']);
  });
});

const DAY = 24 * 60 * 60 * 1000;
const mem = (over: Partial<MomentsMemory>): MomentsMemory => ({ ...EMPTY_MEMORY, ...over });
const daysAgoYmd = (n: number): string => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const unseen = { showWhereIGo: true, whereIGoNoticeSeen: false };

describe('shouldShowWhereIGoNotice', () => {
  it('shows the day after the first completed visit, not on the day', () => {
    expect(shouldShowWhereIGoNotice(unseen, [booking({ bookingDate: '2026-11-07' })], EMPTY_MEMORY, NOW)).toBe(true);
    expect(shouldShowWhereIGoNotice(unseen, [booking({ bookingDate: '2026-11-08' })], EMPTY_MEMORY, NOW)).toBe(false);
  });

  it('waits for a completed visit', () => {
    expect(shouldShowWhereIGoNotice(unseen, [booking({ status: 'upcoming' })], EMPTY_MEMORY, NOW)).toBe(false);
  });

  it('is skipped when already seen, or while Show where I go is off', () => {
    expect(shouldShowWhereIGoNotice(on, [booking({})], EMPTY_MEMORY, NOW)).toBe(false);
    expect(shouldShowWhereIGoNotice({ showWhereIGo: false, whereIGoNoticeSeen: false }, [booking({})], EMPTY_MEMORY, NOW)).toBe(false);
  });

  it('comes back a week after being closed, three times at most', () => {
    const shownYesterday = mem({ introShownAt: [NOW.getTime() - DAY] });
    expect(shouldShowWhereIGoNotice(unseen, [booking({})], shownYesterday, NOW)).toBe(false);
    const shownWeekAgo = mem({ introShownAt: [NOW.getTime() - INTRO_GAP_DAYS * DAY] });
    expect(shouldShowWhereIGoNotice(unseen, [booking({})], shownWeekAgo, NOW)).toBe(true);
    const shownThrice = mem({ introShownAt: [1, 2, 3].map((w) => NOW.getTime() - w * 30 * DAY) });
    expect(shouldShowWhereIGoNotice(unseen, [booking({})], shownThrice, NOW)).toBe(false);
  });
});

describe('canAskOnHome', () => {
  it('asks at most once a week', () => {
    expect(canAskOnHome(EMPTY_MEMORY, NOW)).toBe(true);
    expect(canAskOnHome(mem({ lastAskAt: NOW.getTime() - DAY }), NOW)).toBe(false);
    expect(canAskOnHome(mem({ lastAskAt: NOW.getTime() - ASK_GAP_DAYS * DAY }), NOW)).toBe(true);
  });

  it('stops after two "Not now"s in a row, and a Recommend resets that', () => {
    let m = EMPTY_MEMORY;
    for (let i = 0; i < NOT_NOW_LIMIT; i++) m = withAnswer(m, false);
    expect(canAskOnHome(m, NOW)).toBe(false);
    expect(canAskOnHome(withAnswer(m, true), NOW)).toBe(true);
  });

  it('never asks on a day the intro was shown', () => {
    expect(canAskOnHome(withIntroShown(EMPTY_MEMORY, new Date(2026, 10, 8, 9, 0)), NOW)).toBe(false);
    expect(canAskOnHome(withIntroShown(EMPTY_MEMORY, new Date(2026, 10, 7, 23, 0)), NOW)).toBe(true);
  });
});

describe('recommendCandidates', () => {
  it('takes visits from yesterday back a week, newest first, one per provider', () => {
    const out = recommendCandidates(
      [
        booking({ id: 'today', providerId: 'p0', bookingDate: daysAgoYmd(0) }),
        booking({ id: 'older', providerId: 'p1', bookingDate: daysAgoYmd(5) }),
        booking({ id: 'newer', providerId: 'p1', bookingDate: daysAgoYmd(1) }),
        booking({ id: 'p2', providerId: 'p2', bookingDate: daysAgoYmd(3) }),
        booking({ id: 'tooOld', providerId: 'p3', bookingDate: daysAgoYmd(RECOMMEND_WINDOW_DAYS + 1) }),
        booking({ id: 'upcoming', providerId: 'p4', bookingDate: daysAgoYmd(2), status: 'upcoming' }),
        booking({ id: 'noId', providerId: undefined, bookingDate: daysAgoYmd(2) }),
        booking({ id: 'bad', providerId: 'p5', bookingDate: 'not a date' }),
      ],
      EMPTY_MEMORY,
      NOW,
    );
    expect(out.map((b) => b.id)).toEqual(['newer', 'p2']);
  });

  it('skips providers already asked about', () => {
    const asked = withAsked(EMPTY_MEMORY, 'p1', new Date(0));
    expect(recommendCandidates([booking({ providerId: 'p1' })], asked, NOW)).toEqual([]);
  });
});

describe('nextCircleStep', () => {
  it('puts the intro before any Recommend ask', () => {
    expect(nextCircleStep(unseen, [booking({})], EMPTY_MEMORY, NOW)).toEqual({ kind: 'notice' });
  });

  it('offers the recent visits once the intro has been seen', () => {
    expect(nextCircleStep(on, [booking({})], EMPTY_MEMORY, NOW)).toEqual({ kind: 'candidates', bookings: [booking({})] });
  });

  it('asks nothing while Show where I go is off, or inside the weekly gap', () => {
    expect(nextCircleStep({ showWhereIGo: false, whereIGoNoticeSeen: true }, [booking({})], EMPTY_MEMORY, NOW)).toBeNull();
    expect(nextCircleStep(on, [booking({})], mem({ lastAskAt: NOW.getTime() }), NOW)).toBeNull();
  });
});

describe('moments memory', () => {
  it('reads back what it wrote, and survives junk', () => {
    const m = withIntroShown(withAnswer(withAsked(EMPTY_MEMORY, 'p1', NOW), false), NOW);
    expect(parseMomentsMemory(JSON.stringify(m))).toEqual(m);
    expect(parseMomentsMemory('{not json')).toEqual(EMPTY_MEMORY);
    expect(parseMomentsMemory(JSON.stringify({ prompted: [1, 'p2'], notNowStreak: 'x' }))).toEqual(mem({ prompted: ['p2'] }));
  });

  it('labels the visit in plain words', () => {
    expect(visitWhenLabel('2026-11-07', NOW)).toBe('Yesterday');
    expect(visitWhenLabel('2026-11-05', NOW)).toBe('3 days ago');
  });
});
