// src/components/WhatsNewSheet.tsx
//
// "What's new" after someone updates to a new build: a bottom sheet on Home,
// shown once per release per hat, plus the release list it shares with the
// Settings > What's New screen.
//
// The notes come from src/data/whatsNew.ts. Who is owed what is decided in
// src/utils/whatsNew.ts (pure) and recorded through tourService, the same
// account-scoped record walkthroughs use, so a release shown on one phone is
// not shown again on another. Recorded on SHOW, not on "Got it", for the same
// reason the walkthroughs are: closing the app with the sheet open must not
// bring it back on every launch.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import type { AppTheme } from '../constants/theme';
import { WHATS_NEW_RELEASES, type WhatsNewRelease } from '../data/whatsNew';
import {
  hatForAudience,
  notesFor,
  releasesAfterSignup,
  WHATS_NEW_MAX_SHOWN,
  type WhatsNewAudience,
} from '../utils/whatsNew';
import { TOUR_KEYS } from '../utils/coachMarkTours';
import { recordTourSeen, resolveTourForUser } from '../services/tourService';
import { formatLongDate } from '../utils/dateUtils';

const TOUR_KEY_FOR_HAT = {
  client: TOUR_KEYS.WHATS_NEW_CLIENT,
  provider: TOUR_KEYS.WHATS_NEW_PROVIDER,
} as const;

/** Let Home settle (and its own entrance finish) before a sheet covers it. */
const ARRIVAL_DELAY_MS = 900;

/**
 * Decide once per account and hat whether Home owes this person release
 * notes, and hold the sheet until Home is the focused screen.
 *
 * `enabled` lets Home hold this back while it is still deciding on (or
 * showing) its first-run walkthrough; two overlays on the same launch is one
 * too many, and anything owed here is still owed next launch because nothing
 * is recorded until the sheet actually appears.
 */
export function useWhatsNew(audience: WhatsNewAudience, enabled: boolean) {
  const { user, session } = useAuth();
  const isFocused = useIsFocused();
  const [releases, setReleases] = useState<WhatsNewRelease[]>([]);
  const [armed, setArmed] = useState(false);
  const checkedRef = useRef<string | null>(null);
  const armedRef = useRef(false);
  armedRef.current = armed;

  const userId = user?.id ?? null;
  const createdAt = session?.user?.created_at ?? null;

  useEffect(() => {
    if (!enabled || !userId) return;
    const checkKey = `${userId}:${audience}`;
    if (checkedRef.current === checkKey) return;
    checkedRef.current = checkKey;

    const candidates = releasesAfterSignup(WHATS_NEW_RELEASES, audience, createdAt);
    if (candidates.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tour = TOUR_KEY_FOR_HAT[hatForAudience(audience)];
    void (async () => {
      const decision = await resolveTourForUser(
        tour,
        candidates.map(release => ({ key: String(release.version), sinceVersion: release.version })),
        userId,
      );
      if (cancelled || !decision.show) return;
      const owed = new Set(decision.steps.map(step => step.key));
      setReleases(
        candidates.filter(release => owed.has(String(release.version))).slice(0, WHATS_NEW_MAX_SHOWN),
      );
      timer = setTimeout(() => {
        if (cancelled) return;
        setArmed(true);
        void recordTourSeen(tour, userId, decision.stampVersion);
      }, ARRIVAL_DELAY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Let a re-run (e.g. focus/enable toggling before the timer fired)
      // decide again rather than leaving the check spent with nothing shown.
      if (!armedRef.current) checkedRef.current = null;
    };
  }, [enabled, userId, audience, createdAt]);

  const dismiss = useCallback(() => setArmed(false), []);

  return { releases, visible: armed && isFocused && releases.length > 0, dismiss };
}

// ─── Release list (shared with the Settings screen) ───────────────────────────

export function WhatsNewReleaseList({
  releases,
  audience,
  P,
  showDates,
}: {
  releases: readonly WhatsNewRelease[];
  audience: WhatsNewAudience;
  P: AppTheme;
  showDates: boolean;
}) {
  return (
    <>
      {releases.map((release, index) => (
        <View key={release.version} style={index > 0 ? styles.releaseGap : undefined}>
          {showDates && (
            <Text style={[styles.releaseDate, { color: P.accentText }]}>
              {formatLongDate(release.date).toUpperCase()}
            </Text>
          )}
          {notesFor(release, audience).map(item => (
            <View key={item.title} style={styles.item}>
              <View style={[styles.itemIcon, { backgroundColor: P.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={P.accentText} />
              </View>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: P.text }]}>{item.title}</Text>
                <Text style={[styles.itemBody, { color: P.sub }]}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

interface WhatsNewSheetProps {
  audience: WhatsNewAudience;
  releases: readonly WhatsNewRelease[];
  visible: boolean;
  onClose: () => void;
}

/** Renders nothing, and touches no context, until there are notes to show —
 *  which for almost every Home render is never. Releases stay set after
 *  "Got it", so the slide-out still plays. */
export function WhatsNewSheet(props: WhatsNewSheetProps) {
  if (props.releases.length === 0) return null;
  return <WhatsNewSheetBody {...props} />;
}

function WhatsNewSheetBody({ audience, releases, visible, onClose }: WhatsNewSheetProps) {
  const { palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    let alive = true;
    if (visible) setMounted(true);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => {
        if (!alive) return;
        const toValue = visible ? 1 : 0;
        const done = () => { if (alive && !visible) setMounted(false); };
        if (reduce) {
          slide.setValue(toValue);
          done();
          return;
        }
        Animated.timing(slide, {
          toValue,
          duration: visible ? 320 : 220,
          easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(done);
      });
    return () => { alive = false; };
  }, [visible, slide]);

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
  };

  if (!mounted) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { opacity: slide }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: P.surfaceRaised,
            borderColor: P.border,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            maxHeight: screenH * 0.82,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: P.border }]} />
        <Text style={[styles.eyebrow, { color: P.accentText }]}>{t('whatsNew.eyebrow')}</Text>
        <Text style={[styles.title, { color: P.text }]}>{t('whatsNew.sheetTitle')}</Text>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          <WhatsNewReleaseList releases={releases} audience={audience} P={P} showDates={releases.length > 1} />
        </ScrollView>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: P.accent }]}
          onPress={close}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: P.onAccent }]}>{t('whatsNew.done')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 20 },
  eyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, marginBottom: 6 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 24, letterSpacing: 1, marginBottom: 20 },
  scroll: { flexGrow: 0, marginBottom: 20 },
  releaseGap: { marginTop: 18 },
  releaseDate: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.5, marginBottom: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  itemText: { flex: 1 },
  itemTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.5, marginBottom: 3 },
  itemBody: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  button: { borderRadius: 100, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1 },
});
