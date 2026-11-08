// src/features/social/circleMoments.ts
//
// Which "after a completed booking" moment, if any, the client should see
// next: the one-time "Show where I go" notice, or "Send people their way?"
// for one provider. Pure so the rules are tested once; CircleMomentsHost
// does the fetching and showing.
//
// Rules (decided 2026-11-08):
// - The notice comes after the client's FIRST completed booking, once. Until
//   it's been seen the server counts no visits, only recommends. It's skipped
//   while Show where I go is off — nothing shows then, so there's nothing to
//   explain (turning the switch on marks it seen instead).
// - The Recommend prompt is for the most recent completed booking in the last
//   RECOMMEND_PROMPT_WINDOW_DAYS, asked once per provider, never while Show
//   where I go is off.
// - The notice always goes first; the prompt waits for a later session.

import type { SocialSettings } from './types';

export const RECOMMEND_PROMPT_WINDOW_DAYS = 14;

/** On-device list of providers already asked about. Cleared at sign-out (AuthContext.logout). */
export const recommendPromptedStorageKey = (userId: string): string =>
  `circle.recommendPrompted.${userId}`;

/** The bits of a booking the moments need (ConfirmedBooking satisfies it). */
export interface CompletedBookingLike {
  id: string;
  providerId?: string | undefined;
  providerName: string;
  /** YYYY-MM-DD */
  bookingDate: string;
  status: string;
}

export type CircleMoment =
  | { kind: 'notice' }
  | { kind: 'recommend'; bookingId: string; providerId: string; providerName: string };

function isCompleted(b: CompletedBookingLike): boolean {
  return b.status === 'completed';
}

/** Local midnight of a YYYY-MM-DD date, or null when it doesn't parse. */
function dayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function shouldShowWhereIGoNotice(
  settings: Pick<SocialSettings, 'showWhereIGo' | 'whereIGoNoticeSeen'>,
  bookings: readonly CompletedBookingLike[],
): boolean {
  return !settings.whereIGoNoticeSeen && settings.showWhereIGo && bookings.some(isCompleted);
}

/**
 * The completed booking to ask "Send people their way?" about: the latest one
 * inside the window whose provider hasn't been asked about before. Whether the
 * provider can still be recommended (not already, not hidden) is the server's
 * answer, checked by the caller.
 */
export function pickRecommendPromptBooking(
  bookings: readonly CompletedBookingLike[],
  promptedProviderIds: ReadonlySet<string>,
  now: Date,
): CompletedBookingLike | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - RECOMMEND_PROMPT_WINDOW_DAYS);
  let best: { booking: CompletedBookingLike; day: Date } | null = null;
  for (const b of bookings) {
    if (!isCompleted(b) || !b.providerId || promptedProviderIds.has(b.providerId)) continue;
    const day = dayStart(b.bookingDate);
    if (!day || day < earliest || day > today) continue;
    if (!best || day > best.day) best = { booking: b, day };
  }
  return best?.booking ?? null;
}

/** The next moment from what's known locally; null means nothing to show. */
export function nextCircleMoment(
  settings: Pick<SocialSettings, 'showWhereIGo' | 'whereIGoNoticeSeen'>,
  bookings: readonly CompletedBookingLike[],
  promptedProviderIds: ReadonlySet<string>,
  now: Date,
): CircleMoment | null {
  if (shouldShowWhereIGoNotice(settings, bookings)) return { kind: 'notice' };
  if (!settings.showWhereIGo) return null;
  const booking = pickRecommendPromptBooking(bookings, promptedProviderIds, now);
  if (!booking || !booking.providerId) return null;
  return {
    kind: 'recommend',
    bookingId: booking.id,
    providerId: booking.providerId,
    providerName: booking.providerName,
  };
}
