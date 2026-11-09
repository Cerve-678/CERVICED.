// src/features/social/RecommendAfterRating.tsx
//
// After a client rates a visit 4 or 5 stars, a slim bar slides up offering
// Recommend (style B, chosen 2026-11-09). It goes away by itself after a few
// seconds; × counts as "Not now". Not offered while Show where I go is off
// (nobody would see it), or for a provider already recommended or hidden.
//
// Usage: const after = useRecommendAfterRating(userId); call
// after.offer(providerId, providerName, rating) once the rating is saved, and
// render <RecommendAfterRatingBar {...after.bar} P={P} /> last in the screen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppTheme } from '../../constants/theme';
import { getMyProviderSharing } from '../../services/databaseService';
import { recommendProvider } from './recommend';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { logger } from '../../utils/logger';
import { FONT_BODY, FONT_DISPLAY, hapticLight, hapticSuccess } from '../maintenance/ui';
import { initialsFor } from './presentation';
import { RECOMMEND_AFTER_RATING_MIN, withAnswer, withAsked } from './circleMoments';
import { updateMomentsMemory } from './momentsMemory';

const AUTO_HIDE_MS = 8000;
const HEART = '#FF2D78';

interface Offer { providerId: string; providerName: string }

export interface RecommendBarProps {
  offer: Offer | null;
  busy: boolean;
  onYes: () => void;
  onClose: (byTap: boolean) => void;
}

export function useRecommendAfterRating(userId: string | null, onRecommended?: (providerId: string) => void) {
  const [offerState, setOfferState] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const onRecommendedRef = useRef(onRecommended);
  onRecommendedRef.current = onRecommended;

  const offer = useCallback(async (providerId: string | null | undefined, providerName: string, rating: number) => {
    if (!userId || !providerId || rating < RECOMMEND_AFTER_RATING_MIN) return;
    try {
      const [settings, sharing] = await Promise.all([
        useSocialSettingsStore.getState().load(userId),
        getMyProviderSharing(providerId),
      ]);
      if (!settings.showWhereIGo || !sharing.canRecommend || sharing.recommended || sharing.hidden) return;
      await updateMomentsMemory(userId, (m) => withAsked(m, providerId, new Date()));
      setOfferState({ providerId, providerName });
    } catch (err) {
      // Decoration after a rating that already saved: nothing to show.
      logger.warn('[recommend-after-rating] could not check', err);
    }
  }, [userId]);

  const onClose = useCallback((byTap: boolean) => {
    if (byTap && userId) void updateMomentsMemory(userId, (m) => withAnswer(m, false));
    setOfferState(null);
  }, [userId]);

  const onYes = useCallback(async () => {
    if (!offerState || busy) return;
    setBusy(true);
    try {
      await recommendProvider(offerState.providerId, true);
      hapticSuccess();
      if (userId) void updateMomentsMemory(userId, (m) => withAnswer(m, true));
      onRecommendedRef.current?.(offerState.providerId);
      setOfferState(null);
    } catch (err) {
      // They can still recommend from the booking or the provider's page.
      logger.warn('[recommend-after-rating] recommend failed', err);
      setOfferState(null);
    } finally {
      setBusy(false);
    }
  }, [offerState, busy, userId]);

  const offerSync = useCallback(
    (providerId: string | null | undefined, providerName: string, rating: number) => void offer(providerId, providerName, rating),
    [offer],
  );
  const onYesSync = useCallback(() => void onYes(), [onYes]);
  const bar = useMemo<RecommendBarProps>(
    () => ({ offer: offerState, busy, onYes: onYesSync, onClose }),
    [offerState, busy, onYesSync, onClose],
  );
  return useMemo(() => ({ offer: offerSync, bar }), [offerSync, bar]);
}

/** `bottomOffset`: distance from the screen's bottom edge, e.g. above a floating tab bar. */
export function RecommendAfterRatingBar({
  offer, busy, onYes, onClose, P, bottomOffset,
}: RecommendBarProps & { P: AppTheme; bottomOffset?: number | undefined }) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Offer | null>(offer);

  useEffect(() => {
    if (offer) {
      setShown(offer);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
      const t = setTimeout(() => onClose(false), AUTO_HIDE_MS);
      return () => clearTimeout(t);
    }
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setShown(null));
    return undefined;
  }, [offer, slide, onClose]);

  if (!shown) return null;
  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: P.accent,
          bottom: bottomOffset ?? insets.bottom + 16,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
    >
      <View style={styles.logoWrap}>
        <View style={[styles.logo, { backgroundColor: P.secondary }]}>
          <Text style={[styles.logoText, { color: P.secondaryText }]}>{initialsFor(shown.providerName)}</Text>
        </View>
        <View style={[styles.heart, { borderColor: P.accent }]}>
          <Ionicons name="heart" size={8} color="#FFFFFF" />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: P.onAccent }]} numberOfLines={1}>Recommend {shown.providerName}?</Text>
        <Text style={[styles.sub, { color: P.onAccent }]} numberOfLines={1}>Glad you enjoyed it</Text>
      </View>
      <TouchableOpacity
        style={[styles.yes, { backgroundColor: P.onAccent }]}
        onPress={onYes}
        disabled={busy}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Recommend ${shown.providerName}`}
      >
        {busy ? <ActivityIndicator size="small" color={P.accent} /> : (
          <>
            <Ionicons name="heart" size={12} color={HEART} />
            <Text style={[styles.yesText, { color: P.accent }]}>YES</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.close}
        onPress={() => { hapticLight(); onClose(true); }}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        activeOpacity={0.6}
      >
        <Ionicons name="close" size={18} color={P.onAccent} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 64,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 4,
    shadowColor: '#3F1E36',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logoWrap: { width: 44, height: 44 },
  logo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: FONT_DISPLAY, fontSize: 13 },
  heart: {
    position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    backgroundColor: HEART, alignItems: 'center', justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  sub: { fontFamily: FONT_BODY, fontSize: 12, opacity: 0.8 },
  yes: { height: 44, paddingHorizontal: 16, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 },
  yesText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
