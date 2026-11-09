// src/features/social/circleMoments.ts
//
// When the client is asked to Recommend a provider, and when the one-time
// "Show where I go" intro appears. Pure, so the rules are tested once;
// useCircleMoment (Home) and useRecommendAfterRating (the rating step) do the
// fetching and showing. What's been asked is remembered on the device in
// MomentsMemory (momentsMemory.ts).
//
// Rules (decided 2026-11-09, "T1 + T2"):
// - After rating a visit 4 or 5 stars, a slim bar offers Recommend.
// - Home asks with a card only for a visit that wasn't rated: the day after
//   it (not on the day), within RECOMMEND_WINDOW_DAYS, at most once every
//   ASK_GAP_DAYS for all providers, once per provider, never on a day the
//   intro was shown, and not at all after NOT_NOW_LIMIT "Not now"s in a row.
// - Nobody is asked while Show where I go is off: nobody would see it.
// - The intro comes the day after the first completed visit. Closing it
//   without a button brings it back, at most INTRO_MAX_SHOWS times in all,
//   INTRO_GAP_DAYS apart. Until it's been seen, visits aren't shared.

import type { SocialSettings } from './types';

export const RECOMMEND_WINDOW_DAYS = 7;
export const ASK_GAP_DAYS = 7;
export const NOT_NOW_LIMIT = 2;
export const INTRO_MAX_SHOWS = 3;
export const INTRO_GAP_DAYS = 7;
/** Only ratings this high get the Recommend bar. */
export const RECOMMEND_AFTER_RATING_MIN = 4;
/** Providers kept in the asked-about list; plenty for anyone's history. */
const PROMPTED_KEEP = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What's been asked, kept on the device per account. */
export interface MomentsMemory {
  /** Providers already asked about, oldest first. */
  prompted: string[];
  /** When the last Recommend ask was shown (ms). */
  lastAskAt: number | null;
  /** "Not now"s in a row; a Recommend resets it. */
  notNowStreak: number;
  /** Each time the intro was shown (ms). */
  introShownAt: number[];
}

export const EMPTY_MEMORY: MomentsMemory = Object.freeze({
  prompted: [],
  lastAskAt: null,
  notNowStreak: 0,
  introShownAt: [],
}) as MomentsMemory;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Reads stored memory, tolerating anything missing or malformed. */
export function parseMomentsMemory(raw: string | null): MomentsMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof MomentsMemory, unknown>>;
    return {
      prompted: Array.isArray(v.prompted) ? v.prompted.filter((x): x is string => typeof x === 'string') : [],
      lastAskAt: isNum(v.lastAskAt) ? v.lastAskAt : null,
      notNowStreak: isNum(v.notNowStreak) ? Math.max(0, Math.floor(v.notNowStreak)) : 0,
      introShownAt: Array.isArray(v.introShownAt) ? v.introShownAt.filter(isNum) : [],
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

/** Memory after a Recommend ask was shown for this provider. */
export function withAsked(memory: MomentsMemory, providerId: string, now: Date): MomentsMemory {
  const prompted = memory.prompted.filter((id) => id !== providerId);
  prompted.push(providerId);
  return { ...memory, prompted: prompted.slice(-PROMPTED_KEEP), lastAskAt: now.getTime() };
}

/** Memory after the client answered an ask: Recommend resets the streak, "Not now" adds to it. */
export function withAnswer(memory: MomentsMemory, recommended: boolean): MomentsMemory {
  return { ...memory, notNowStreak: recommended ? 0 : memory.notNowStreak + 1 };
}

export function withIntroShown(memory: MomentsMemory, now: Date): MomentsMemory {
  return { ...memory, introShownAt: [...memory.introShownAt, now.getTime()].slice(-INTRO_MAX_SHOWS) };
}

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
  | { kind: 'recommend'; bookingId: string; bookingDate: string; providerId: string; providerName: string };

/** Local midnight of a YYYY-MM-DD date, or null when it doesn't parse. */
function dayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from the visit's date to today (1 = yesterday), or null. */
export function daysSinceVisit(bookingDate: string, now: Date): number | null {
  const day = dayStart(bookingDate);
  if (!day) return null;
  return Math.round((startOfDay(now).getTime() - day.getTime()) / DAY_MS);
}

const isCompleted = (b: CompletedBookingLike): boolean => b.status === 'completed';

export function shouldShowWhereIGoNotice(
  settings: Pick<SocialSettings, 'showWhereIGo' | 'whereIGoNoticeSeen'>,
  bookings: readonly CompletedBookingLike[],
  memory: MomentsMemory,
  now: Date,
): boolean {
  if (settings.whereIGoNoticeSeen || !settings.showWhereIGo) return false;
  if (memory.introShownAt.length >= INTRO_MAX_SHOWS) return false;
  const last = memory.introShownAt[memory.introShownAt.length - 1];
  if (last !== undefined && now.getTime() - last < INTRO_GAP_DAYS * DAY_MS) return false;
  // The day after a visit, not on the day.
  return bookings.some((b) => {
    if (!isCompleted(b)) return false;
    const days = daysSinceVisit(b.bookingDate, now);
    return days !== null && days >= 1;
  });
}

/** Whether Home may ask about anyone right now (the caps, not the candidates). */
export function canAskOnHome(memory: MomentsMemory, now: Date): boolean {
  if (memory.notNowStreak >= NOT_NOW_LIMIT) return false;
  if (memory.lastAskAt !== null && now.getTime() - memory.lastAskAt < ASK_GAP_DAYS * DAY_MS) return false;
  const lastIntro = memory.introShownAt[memory.introShownAt.length - 1];
  if (lastIntro !== undefined && startOfDay(new Date(lastIntro)).getTime() === startOfDay(now).getTime()) return false;
  return true;
}

/**
 * Completed visits Home could ask about, newest first, one per provider:
 * from yesterday back to RECOMMEND_WINDOW_DAYS ago, providers not asked
 * about before. Whether it was rated, and whether the provider can still be
 * recommended, are the server's answers, checked by the caller.
 */
export function recommendCandidates(
  bookings: readonly CompletedBookingLike[],
  memory: MomentsMemory,
  now: Date,
): CompletedBookingLike[] {
  const asked = new Set(memory.prompted);
  const fresh = bookings
    .filter((b) => {
      if (!isCompleted(b) || !b.providerId || asked.has(b.providerId)) return false;
      const days = daysSinceVisit(b.bookingDate, now);
      return days !== null && days >= 1 && days <= RECOMMEND_WINDOW_DAYS;
    })
    .sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : a.bookingDate > b.bookingDate ? -1 : 0));
  const seen = new Set<string>();
  return fresh.filter((b) => {
    if (seen.has(b.providerId as string)) return false;
    seen.add(b.providerId as string);
    return true;
  });
}

/** The intro first; otherwise the visits Home may ask about (empty = nothing). */
export function nextCircleStep(
  settings: Pick<SocialSettings, 'showWhereIGo' | 'whereIGoNoticeSeen'>,
  bookings: readonly CompletedBookingLike[],
  memory: MomentsMemory,
  now: Date,
): { kind: 'notice' } | { kind: 'candidates'; bookings: CompletedBookingLike[] } | null {
  if (shouldShowWhereIGoNotice(settings, bookings, memory, now)) return { kind: 'notice' };
  if (!settings.showWhereIGo || !canAskOnHome(memory, now)) return null;
  const candidates = recommendCandidates(bookings, memory, now);
  return candidates.length > 0 ? { kind: 'candidates', bookings: candidates } : null;
}

/** "Yesterday", "3 days ago": the card's small heading. */
export function visitWhenLabel(bookingDate: string, now: Date): string {
  const days = daysSinceVisit(bookingDate, now);
  if (days === null || days <= 0) return 'Your visit';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
