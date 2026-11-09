// src/features/social/useCircleMoment.ts
//
// Home's side of circleMoments.ts: works out, once per app session, whether
// to show the one-time intro (WhereIGoIntroSheet) or a Recommend card
// (RecommendHomeCard), and what each button does.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMyProviderSharing,
  hasReviewedBooking,
} from '../../services/databaseService';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { logger } from '../../utils/logger';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { hapticSuccess } from '../maintenance/ui';
import {
  nextCircleStep,
  withAnswer,
  withAsked,
  withIntroShown,
  type CircleMoment,
  type CompletedBookingLike,
} from './circleMoments';
import { readMomentsMemory, updateMomentsMemory } from './momentsMemory';
import { recommendProvider } from './recommend';

/** Let Home finish loading (and its own first-run tour decide) first. */
const SETTLE_MS = 2000;
/** Visits checked with the server per pass; the rest wait for another day. */
const MAX_CANDIDATES = 3;

/** Users already checked this app session. */
const checkedThisSession = new Set<string>();

export interface CircleMomentState {
  moment: CircleMoment | null;
  busy: boolean;
  error: string | null;
  recommend: () => void;
  /** The card's ×: counts as "Not now". */
  notNow: () => void;
  /** The intro's buttons. Closing it without one just hides it for now. */
  finishIntro: (turnOff: boolean) => void;
  closeIntro: () => void;
}

export function useCircleMoment(
  userId: string | null,
  bookings: readonly CompletedBookingLike[],
  active: boolean,
): CircleMomentState {
  const [moment, setMoment] = useState<CircleMoment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bookingsRef = useRef(bookings);
  bookingsRef.current = bookings;
  const hasCompleted = bookings.some((b) => b.status === 'completed');

  useEffect(() => {
    if (!active || !userId || !hasCompleted || checkedThisSession.has(userId)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      checkedThisSession.add(userId);
      try {
        const [settings, memory] = await Promise.all([
          useSocialSettingsStore.getState().load(userId),
          readMomentsMemory(userId),
        ]);
        const now = new Date();
        const step = nextCircleStep(settings, bookingsRef.current, memory, now);
        if (!step) return;
        if (step.kind === 'notice') {
          if (cancelled) { checkedThisSession.delete(userId); return; }
          await updateMomentsMemory(userId, (m) => withIntroShown(m, now));
          setMoment({ kind: 'notice' });
          return;
        }
        // Home only asks about a visit that wasn't rated (rating 4–5 already
        // offered it; 1–3 means don't), for a provider still recommendable.
        const picks = step.bookings.slice(0, MAX_CANDIDATES);
        const checks = await Promise.all(
          picks.map(async (b) => {
            const [rated, sharing] = await Promise.all([
              hasReviewedBooking(b.id),
              getMyProviderSharing(b.providerId as string),
            ]);
            return !rated && sharing.canRecommend && !sharing.recommended && !sharing.hidden;
          }),
        );
        const chosen = picks.find((_, i) => checks[i]);
        if (cancelled) { checkedThisSession.delete(userId); return; }
        if (!chosen || !chosen.providerId) return;
        // Recorded when shown, so killing the app doesn't ask again.
        await updateMomentsMemory(userId, (m) => withAsked(m, chosen.providerId as string, now));
        setError(null);
        setMoment({
          kind: 'recommend',
          bookingId: chosen.id,
          bookingDate: chosen.bookingDate,
          providerId: chosen.providerId,
          providerName: chosen.providerName,
        });
      } catch (err) {
        // Decoration: a failed check means nothing this session.
        logger.warn('[circle-moments] could not check for a moment', err);
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, userId, hasCompleted]);

  const clear = useCallback(() => {
    setMoment(null);
    setBusy(false);
    setError(null);
  }, []);

  const recommend = useCallback(async () => {
    if (moment?.kind !== 'recommend' || busy || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await recommendProvider(moment.providerId, true);
      hapticSuccess();
      void updateMomentsMemory(userId, (m) => withAnswer(m, true));
      clear();
    } catch (err) {
      setError(toUserMessageAllowingDbGuard(err, "Couldn't recommend them just now. Please try again.", '[circle-moments] recommend'));
      setBusy(false);
    }
  }, [moment, busy, userId, clear]);

  const notNow = useCallback(() => {
    if (userId) void updateMomentsMemory(userId, (m) => withAnswer(m, false));
    clear();
  }, [userId, clear]);

  // Marked seen only on a button: visits start being shared from then.
  const finishIntro = useCallback(
    async (turnOff: boolean) => {
      if (!userId || busy) return;
      setBusy(true);
      setError(null);
      const store = useSocialSettingsStore.getState();
      if (turnOff) {
        try {
          await store.update(userId, { showWhereIGo: false });
        } catch (err) {
          setError(toUserMessageAllowingDbGuard(err, "Couldn't turn it off. Please try again.", '[circle-moments] turn off show where I go'));
          setBusy(false);
          return;
        }
      }
      try {
        await store.markNoticeSeen(userId);
      } catch (err) {
        logger.warn('[circle-moments] could not mark the intro seen', err);
      }
      clear();
    },
    [userId, busy, clear],
  );

  return {
    moment,
    busy,
    error,
    recommend: () => void recommend(),
    notNow,
    finishIntro: (turnOff: boolean) => void finishIntro(turnOff),
    closeIntro: clear,
  };
}
