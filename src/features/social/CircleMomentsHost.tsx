// src/features/social/CircleMomentsHost.tsx
//
// The two "after a completed booking" moments, mounted on Home:
// 1. The one-time "Show where I go" notice, after the client's FIRST
//    completed booking (decided 2026-11-08: no sign-up screen; this notice
//    instead). Until it's seen the server counts no visits, only recommends.
// 2. "Send people their way?" — Recommend the provider of a recent completed
//    booking, asked once per provider.
// Which one, if either, is circleMoments.ts's job. At most one moment per
// app session, and only while Home is focused with nothing else on top.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyProviderSharing, setProviderRecommendation } from '../../services/databaseService';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { logger } from '../../utils/logger';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { GhostButton, PrimaryButton, Sheet, hapticSuccess, semanticColors, ui } from '../maintenance/ui';
import {
  nextCircleMoment,
  recommendPromptedStorageKey,
  type CircleMoment,
  type CompletedBookingLike,
} from './circleMoments';

/** Let Home finish loading (and its own first-run tour decide) before anything slides up. */
const SETTLE_MS = 2000;
/** Providers whose Recommend prompt has been skipped as not applicable, per pass. */
const MAX_PROMPT_CANDIDATES = 3;

/** Users who've already had a moment (or a check that found none) this session. */
const checkedThisSession = new Set<string>();

async function readPrompted(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(recommendPromptedStorageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch (err) {
    logger.warn('[circle-moments] could not read prompted providers', err);
    return new Set();
  }
}

async function addPrompted(userId: string, providerIds: readonly string[]): Promise<void> {
  if (providerIds.length === 0) return;
  try {
    const set = await readPrompted(userId);
    providerIds.forEach((id) => set.add(id));
    // Newest last; a few hundred ids is plenty.
    await AsyncStorage.setItem(recommendPromptedStorageKey(userId), JSON.stringify(Array.from(set).slice(-300)));
  } catch (err) {
    logger.warn('[circle-moments] could not save prompted providers', err);
  }
}

interface Props {
  userId: string | null;
  bookings: readonly CompletedBookingLike[];
  /** Home focused, with no tour or other sheet showing. */
  active: boolean;
}

export function CircleMomentsHost({ userId, bookings, active }: Props) {
  const { palette: P, isDarkMode } = useTheme();
  const S = semanticColors(isDarkMode);
  const settings = useSocialSettingsStore((s) => (s.ownerId === userId ? s.settings : null));
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
        const [current, prompted] = await Promise.all([
          useSocialSettingsStore.getState().load(userId),
          readPrompted(userId),
        ]);
        const skipped: string[] = [];
        let next = nextCircleMoment(current, bookingsRef.current, prompted, new Date());
        // A provider already recommended or hidden isn't worth asking about;
        // note it and look at the next recent one, up to a few.
        let verified = next?.kind !== 'recommend';
        for (let i = 0; next?.kind === 'recommend' && i < MAX_PROMPT_CANDIDATES; i++) {
          const sharing = await getMyProviderSharing(next.providerId);
          if (sharing.canRecommend && !sharing.recommended && !sharing.hidden) {
            verified = true;
            break;
          }
          skipped.push(next.providerId);
          prompted.add(next.providerId);
          next = nextCircleMoment(current, bookingsRef.current, prompted, new Date());
          verified = next?.kind !== 'recommend';
        }
        if (!verified) next = null;
        if (cancelled) {
          // Home lost focus mid-check: keep what was ruled out, and let a
          // later visit this session show the moment.
          await addPrompted(userId, skipped);
          checkedThisSession.delete(userId);
          return;
        }
        // Asked once per provider: recorded when shown, so a kill mid-sheet doesn't ask again.
        await addPrompted(userId, next?.kind === 'recommend' ? [...skipped, next.providerId] : skipped);
        setError(null);
        setMoment(next);
      } catch (err) {
        // Decoration: a failed check means no moment this session, nothing more.
        logger.warn('[circle-moments] could not check for a moment', err);
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, userId, hasCompleted]);

  const close = useCallback(() => {
    setMoment(null);
    setBusy(false);
    setError(null);
  }, []);

  // Marked seen only on a button press — visits start counting from it, so a
  // swipe-away just hides it for this session and it comes back next time.
  // A failure to record it means the same.
  const finishNotice = useCallback(
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
        logger.warn('[circle-moments] could not mark the notice seen', err);
      }
      close();
    },
    [userId, busy, close],
  );

  const recommend = useCallback(async () => {
    if (moment?.kind !== 'recommend' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setProviderRecommendation(moment.providerId, true);
      hapticSuccess();
      close();
    } catch (err) {
      setError(toUserMessageAllowingDbGuard(err, "Couldn't recommend them just now. Please try again.", '[circle-moments] recommend'));
      setBusy(false);
    }
  }, [moment, busy, close]);

  if (!moment) return null;

  if (moment.kind === 'notice') {
    // Says private or open, so it waits for the real settings rather than guessing.
    if (!settings) return null;
    return (
      <Sheet visible={active} onClose={close} P={P}>
        <Text style={[ui.label, { color: P.sub }]}>SHOW WHERE I GO</Text>
        <Text style={[ui.sheetTitle, { color: P.text }]}>Your followers can see where you go</Text>
        <Text style={[ui.body, styles.body, { color: P.text }]}>
          People who follow you will see your face on the providers you've booked, including appointments
          you've already had, and how many times you've been. They never see which service you had.
        </Text>
        <Text style={[ui.body, styles.body, { color: P.sub }]}>
          {!settings.isPrivate
            ? 'Your account is open, so anyone can follow you and see this.'
            : 'Your account is private, so only people you accept can see this.'}{' '}
          Aesthetics visits only show if you recommend the provider. You can hide any provider, or turn
          this off, any time in Beauty Profile → Your circle.
        </Text>
        {error ? <Text style={[ui.inlineError, { color: S.bad }]}>{error}</Text> : null}
        <View style={styles.buttons}>
          <PrimaryButton label="Got it" onPress={() => void finishNotice(false)} disabled={busy} P={P} />
          <GhostButton label="Turn it off" onPress={() => void finishNotice(true)} disabled={busy} P={P} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={active} onClose={close} P={P}>
      <Text style={[ui.label, { color: P.sub }]}>SEND PEOPLE THEIR WAY?</Text>
      <Text style={[ui.sheetTitle, { color: P.text }]} numberOfLines={2}>{moment.providerName}</Text>
      <Text style={[ui.body, styles.body, { color: P.text }]}>
        Recommend {moment.providerName} and people who follow you will see a heart on your face on their
        cards. Just that you recommend them, never which service you had.
      </Text>
      {error ? <Text style={[ui.inlineError, { color: S.bad }]}>{error}</Text> : null}
      <View style={styles.buttons}>
        <PrimaryButton label="Recommend" icon="heart" onPress={() => void recommend()} disabled={busy} P={P} />
        <GhostButton label="Not now" onPress={close} disabled={busy} P={P} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  buttons: { gap: 10, marginTop: 4 },
});
