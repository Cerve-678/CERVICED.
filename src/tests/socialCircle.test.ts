import {
  nextCircleMoment,
  pickRecommendPromptBooking,
  RECOMMEND_PROMPT_WINDOW_DAYS,
  shouldShowWhereIGoNotice,
  type CompletedBookingLike,
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

describe('shouldShowWhereIGoNotice', () => {
  it('shows once there is a completed booking and it has not been seen', () => {
    expect(shouldShowWhereIGoNotice({ showWhereIGo: true, whereIGoNoticeSeen: false }, [booking({})])).toBe(true);
  });

  it('waits for the first completed booking', () => {
    expect(
      shouldShowWhereIGoNotice({ showWhereIGo: true, whereIGoNoticeSeen: false }, [booking({ status: 'upcoming' })]),
    ).toBe(false);
  });

  it('is skipped when already seen, or while Show where I go is off', () => {
    expect(shouldShowWhereIGoNotice({ showWhereIGo: true, whereIGoNoticeSeen: true }, [booking({})])).toBe(false);
    expect(shouldShowWhereIGoNotice({ showWhereIGo: false, whereIGoNoticeSeen: false }, [booking({})])).toBe(false);
  });
});

describe('pickRecommendPromptBooking', () => {
  it('picks the latest completed booking in the window', () => {
    const out = pickRecommendPromptBooking(
      [
        booking({ id: 'old', providerId: 'p1', bookingDate: '2026-11-01' }),
        booking({ id: 'new', providerId: 'p2', bookingDate: '2026-11-06' }),
        booking({ id: 'upcoming', providerId: 'p3', bookingDate: '2026-11-07', status: 'upcoming' }),
      ],
      new Set(),
      NOW,
    );
    expect(out?.id).toBe('new');
  });

  it('skips providers already asked about, and bookings without a provider id', () => {
    const out = pickRecommendPromptBooking(
      [
        booking({ id: 'asked', providerId: 'p1', bookingDate: '2026-11-07' }),
        booking({ id: 'noId', providerId: undefined, bookingDate: '2026-11-07' }),
        booking({ id: 'next', providerId: 'p2', bookingDate: '2026-11-05' }),
      ],
      new Set(['p1']),
      NOW,
    );
    expect(out?.id).toBe('next');
  });

  it('ignores bookings older than the window, or dated in the future', () => {
    const tooOld = new Date(NOW);
    tooOld.setDate(tooOld.getDate() - RECOMMEND_PROMPT_WINDOW_DAYS - 1);
    const ymd = `${tooOld.getFullYear()}-${String(tooOld.getMonth() + 1).padStart(2, '0')}-${String(tooOld.getDate()).padStart(2, '0')}`;
    expect(pickRecommendPromptBooking([booking({ bookingDate: ymd })], new Set(), NOW)).toBeNull();
    expect(pickRecommendPromptBooking([booking({ bookingDate: '2026-11-09' })], new Set(), NOW)).toBeNull();
    expect(pickRecommendPromptBooking([booking({ bookingDate: 'not a date' })], new Set(), NOW)).toBeNull();
  });

  it('counts a booking from today', () => {
    expect(pickRecommendPromptBooking([booking({ bookingDate: '2026-11-08' })], new Set(), NOW)?.id).toBe('b1');
  });
});

describe('nextCircleMoment', () => {
  it('puts the notice before any Recommend prompt', () => {
    expect(
      nextCircleMoment({ showWhereIGo: true, whereIGoNoticeSeen: false }, [booking({})], new Set(), NOW),
    ).toEqual({ kind: 'notice' });
  });

  it('asks about the provider once the notice has been seen', () => {
    expect(nextCircleMoment(on, [booking({})], new Set(), NOW)).toEqual({
      kind: 'recommend', bookingId: 'b1', providerId: 'p1', providerName: 'Glow Studio',
    });
  });

  it('shows nothing while Show where I go is off', () => {
    expect(
      nextCircleMoment({ showWhereIGo: false, whereIGoNoticeSeen: true }, [booking({})], new Set(), NOW),
    ).toBeNull();
  });

  it('shows nothing once every recent provider has been asked about', () => {
    expect(nextCircleMoment(on, [booking({})], new Set(['p1']), NOW)).toBeNull();
  });
});
