// src/features/social/ProviderRecommend.tsx
//
// Recommend on a provider's profile, for a client who has had a completed
// appointment there (the server decides that: get_my_provider_sharing).
// Chosen 2026-11-15 (concepts A1 + A2 + B1–B3, with the long-press dropped):
//
// - The first time the profile is opened, the Recommend bar slides up from
//   the bottom (the same bar as after rating a visit) and goes by itself
//   after a few seconds (shouldOfferOnProfile decides; once per provider).
// - From then on it's a heart in the header beside Bookmark and Share. When
//   the bar goes, the heart glows once with a bubble pointing at it.
// - Tapping the heart recommends and drops a menu down under it with
//   Recommend and "Don't show me on their cards". Tapping anywhere else, or
//   starting to scroll, closes the menu (and the bubble).
//
// Hidden beats Recommend on the server (get_circle_for_providers drops a
// hidden provider's row whatever else is true), so the heart doesn't
// recommend while hidden, and the menu says why. The same goes for the master
// switch: while Show where I go is off nobody sees either, and the menu says so.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyProviderSharing, setProviderHidden } from '../../services/databaseService';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { useCircleStore } from '../../stores/useCircleStore';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';
import { FONT_BODY, hapticLight, hapticSelection, hapticSuccess } from '../maintenance/ui';
import { recommendProvider } from './recommend';
import { RecommendAfterRatingBar } from './RecommendAfterRating';
import { shouldOfferOnProfile, withAnswer, withAsked } from './circleMoments';
import { readMomentsMemory, updateMomentsMemory } from './momentsMemory';
import type { ProviderSharing } from './types';

const HEART = '#FF2D78';
/** Lets the page settle before the bar slides up. */
const BAR_DELAY_MS = 1200;
/** How long the bubble by the heart stays if nobody touches the page. */
const HINT_MS = 5000;

interface Anchor { x: number; y: number; width: number; height: number }
type Phase = 'none' | 'bar' | 'hint';

export interface RecommendHeartProps {
  recommended: boolean;
  /** Glows while the one-time bubble points at it. */
  glowing: boolean;
  busy: boolean;
  providerName: string;
  onPress: () => void;
  anchorRef: React.RefObject<ViewInstance | null>;
}

export interface ProviderRecommendLayerProps {
  providerId: string | null;
  providerName: string;
  sharing: ProviderSharing | null;
  showWhereIGo: boolean | null;
  phase: Phase;
  hintText: string;
  menuOpen: boolean;
  anchor: Anchor | null;
  saving: 'recommend' | 'hidden' | null;
  onBarYes: () => void;
  onBarClose: (byTap: boolean) => void;
  onDismissHint: () => void;
  onCloseMenu: () => void;
  onToggleRecommend: () => void;
  onToggleHidden: () => void;
}

interface Args {
  /** providers.id; null while the profile is still resolving. */
  providerId: string | null;
  providerName: string;
  /** Only a signed-in client viewing someone else's profile. */
  enabled: boolean;
  onError: (title: string, message: string) => void;
}

export function useProviderRecommend({ providerId, providerName, enabled, onError }: Args) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // null until known, so the menu never claims who can see this on a guess.
  const showWhereIGo = useSocialSettingsStore((s) =>
    s.ownerId === userId && s.settings ? s.settings.showWhereIGo : null,
  );
  const [sharing, setSharing] = useState<ProviderSharing | null>(null);
  const [saving, setSaving] = useState<'recommend' | 'hidden' | null>(null);
  const [phase, setPhase] = useState<Phase>('none');
  const [hintText, setHintText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const anchorRef = useRef<ViewInstance | null>(null);
  const seq = useRef(0);
  // Read by dismissFloating, which runs on every touch of the page.
  const floatingRef = useRef(false);
  floatingRef.current = menuOpen || phase === 'hint';

  useEffect(() => {
    const mine = ++seq.current;
    setSharing(null);
    setPhase('none');
    setMenuOpen(false);
    if (!enabled || !providerId || !userId) return undefined;
    let barTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      let next: ProviderSharing;
      try {
        next = await getMyProviderSharing(providerId);
      } catch (err) {
        // Decoration on someone else's profile: without it the page is unchanged.
        logger.warn('[provider-recommend] could not load recommend state', err);
        return;
      }
      if (mine !== seq.current) return;
      setSharing(next);
      try {
        const [settings, memory] = await Promise.all([
          useSocialSettingsStore.getState().load(userId),
          readMomentsMemory(userId),
        ]);
        if (mine !== seq.current || !shouldOfferOnProfile(settings, next, memory, providerId)) return;
        barTimer = setTimeout(() => {
          if (mine !== seq.current) return;
          // Remembered as it shows, so leaving in the first second doesn't use it up.
          void updateMomentsMemory(userId, (m) => withAsked(m, providerId, new Date()));
          setPhase('bar');
        }, BAR_DELAY_MS);
      } catch (err) {
        // Only decides whether the one-time bar shows; the heart still works.
        logger.warn('[provider-recommend] could not check the one-time bar', err);
      }
    })();
    return () => {
      if (barTimer) clearTimeout(barTimer);
    };
  }, [enabled, providerId, userId]);

  // The bubble goes by itself if nobody touches the page.
  useEffect(() => {
    if (phase !== 'hint') return undefined;
    const t = setTimeout(() => setPhase((p) => (p === 'hint' ? 'none' : p)), HINT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const measureHeart = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) setAnchor({ x, y, width, height });
    });
  }, []);

  const setRecommended = useCallback(async (on: boolean): Promise<boolean> => {
    if (!providerId) return false;
    setSaving('recommend');
    try {
      await recommendProvider(providerId, on);
      setSharing((s) => (s ? { ...s, recommended: on } : s));
      if (on) hapticSuccess(); else hapticSelection();
      return true;
    } catch (err) {
      onError(
        on ? "Couldn't recommend" : "Couldn't undo that",
        toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[provider-recommend] set recommendation'),
      );
      return false;
    } finally {
      setSaving(null);
    }
  }, [providerId, onError]);

  const showHint = useCallback((text: string) => {
    setHintText(text);
    measureHeart();
    setPhase('hint');
  }, [measureHeart]);

  const onBarYes = useCallback(async () => {
    if (saving) return;
    const ok = await setRecommended(true);
    if (userId && ok) void updateMomentsMemory(userId, (m) => withAnswer(m, true));
    showHint(ok ? 'Recommended. Tap the heart to change it.' : 'You can recommend from the heart any time.');
  }, [saving, setRecommended, userId, showHint]);

  const onBarClose = useCallback((byTap: boolean) => {
    if (byTap && userId) void updateMomentsMemory(userId, (m) => withAnswer(m, false));
    showHint('Changed your mind? Tap the heart any time.');
  }, [userId, showHint]);

  const onHeartPress = useCallback(() => {
    hapticLight();
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setPhase('none');
    measureHeart();
    setMenuOpen(true);
    if (sharing && !sharing.recommended && !sharing.hidden && !saving) void setRecommended(true);
  }, [menuOpen, measureHeart, sharing, saving, setRecommended]);

  const onToggleRecommend = useCallback(() => {
    if (!sharing || saving || sharing.hidden) return;
    hapticLight();
    void setRecommended(!sharing.recommended);
  }, [sharing, saving, setRecommended]);

  const onToggleHidden = useCallback(async () => {
    if (!providerId || !sharing || saving) return;
    const hidden = !sharing.hidden;
    hapticSelection();
    setSaving('hidden');
    try {
      await setProviderHidden(providerId, hidden);
      // Hidden beats Recommend for your own face too.
      useCircleStore.getState().reloadMine();
      setSharing((s) => (s ? { ...s, hidden } : s));
    } catch (err) {
      onError(
        "Couldn't save that",
        toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[provider-recommend] set hidden'),
      );
    } finally {
      setSaving(null);
    }
  }, [providerId, sharing, saving, onError]);

  const onCloseMenu = useCallback(() => setMenuOpen(false), []);
  const onDismissHint = useCallback(() => setPhase((p) => (p === 'hint' ? 'none' : p)), []);

  /** For the page's own touches and scrolls: closes the menu and the bubble. */
  const dismissFloating = useCallback(() => {
    if (!floatingRef.current) return;
    setMenuOpen(false);
    setPhase((p) => (p === 'hint' ? 'none' : p));
  }, []);

  const canRecommend = enabled && !!sharing?.canRecommend;
  const recommended = sharing?.recommended ?? false;
  const heart = useMemo<RecommendHeartProps | null>(
    () => (canRecommend
      ? {
        recommended,
        glowing: phase === 'hint',
        busy: saving === 'recommend',
        providerName,
        onPress: onHeartPress,
        anchorRef,
      }
      : null),
    [canRecommend, recommended, phase, saving, providerName, onHeartPress],
  );

  const onBarYesSync = useCallback(() => void onBarYes(), [onBarYes]);
  const onToggleHiddenSync = useCallback(() => void onToggleHidden(), [onToggleHidden]);
  const layer = useMemo<ProviderRecommendLayerProps>(() => ({
    providerId,
    providerName,
    sharing: canRecommend ? sharing : null,
    showWhereIGo,
    phase,
    hintText,
    menuOpen,
    anchor,
    saving,
    onBarYes: onBarYesSync,
    onBarClose,
    onDismissHint,
    onCloseMenu,
    onToggleRecommend,
    onToggleHidden: onToggleHiddenSync,
  }), [
    providerId, providerName, canRecommend, sharing, showWhereIGo, phase, hintText, menuOpen, anchor, saving,
    onBarYesSync, onBarClose, onDismissHint, onCloseMenu, onToggleRecommend, onToggleHiddenSync,
  ]);

  return useMemo(() => ({ heart, layer, dismissFloating }), [heart, layer, dismissFloating]);
}

/** The header's heart, beside Bookmark and Share. `style`: the header's own round button. */
export function RecommendHeartButton({
  recommended, glowing, busy, providerName, onPress, anchorRef, style,
}: RecommendHeartProps & { style: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!glowing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [glowing, pulse]);

  return (
    <View ref={anchorRef} collapsable={false}>
      {glowing ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
            },
          ]}
        />
      ) : null}
      <TouchableOpacity
        style={style}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={recommended ? `You recommend ${providerName}` : `Recommend ${providerName}`}
        accessibilityHint="Opens your recommend options"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Ionicons name={recommended ? 'heart' : 'heart-outline'} size={19} color={recommended ? HEART : '#000'} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const MENU_WIDTH = 272;
const EDGE = 12;

/** The bar, the bubble and the menu. Render it last in the screen, over everything. */
export function ProviderRecommendLayer({
  providerId, providerName, sharing, showWhereIGo, phase, hintText, menuOpen, anchor, saving,
  onBarYes, onBarClose, onDismissHint, onCloseMenu, onToggleRecommend, onToggleHidden, bottomOffset,
}: ProviderRecommendLayerProps & { bottomOffset: number }) {
  const { palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const rootRef = useRef<ViewInstance | null>(null);
  const [originY, setOriginY] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: phase === 'hint' ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [phase, fade]);

  const barOffer = useMemo(
    () => (phase === 'bar' && providerId ? { providerId, providerName } : null),
    [phase, providerId, providerName],
  );

  if (!sharing) return null;

  // Window coordinates of the heart; the menu's Modal is the window itself.
  const heartCenter = anchor ? anchor.x + anchor.width / 2 : windowWidth - 100;
  const below = anchor ? anchor.y + anchor.height + 10 : insets.top + 56;
  const menuRight = Math.max(EDGE, anchor ? windowWidth - (anchor.x + anchor.width) : EDGE);
  const bubbleLeft = Math.min(Math.max(EDGE, heartCenter - 190), windowWidth - 240 - EDGE);

  const recommended = sharing.recommended;
  const note = showWhereIGo === false
    ? 'Show where I go is off, so nobody sees this. You can change it in Beauty Profile → Your circle.'
    : sharing.hidden
      ? "You're hidden on their cards, so your recommend doesn't show. Turn this off to show it."
      : recommended && showWhereIGo
        ? 'People who follow you see a heart on your face on their cards.'
        : recommended
          ? 'You recommend them.'
          : 'Send people who follow you their way.';

  return (
    <View
      ref={rootRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={() => rootRef.current?.measureInWindow((_x, y) => setOriginY(y))}
    >
      <RecommendAfterRatingBar
        offer={barOffer}
        busy={saving === 'recommend'}
        onYes={onBarYes}
        onClose={onBarClose}
        P={P}
        bottomOffset={bottomOffset}
        subtitle="You've been here"
        countdown
      />

      {phase === 'hint' ? (
        <Animated.View
          style={[styles.bubbleWrap, { top: below - originY, left: bubbleLeft, opacity: fade }]}
        >
          <View style={[styles.bubbleArrow, { left: heartCenter - bubbleLeft - 7, backgroundColor: P.accent }]} />
          <Pressable
            style={[styles.bubble, { backgroundColor: P.accent }]}
            onPress={onDismissHint}
            accessibilityRole="button"
            accessibilityLabel={`${hintText} Dismiss`}
          >
            <Text style={[styles.bubbleText, { color: P.onAccent }]}>{hintText}</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={onCloseMenu} statusBarTranslucent>
        {/* Any touch outside the menu closes it, including the start of a scroll. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={onCloseMenu}
          accessibilityRole="button"
          accessibilityLabel="Close recommend options"
        />
        <View
          style={[
            styles.menu,
            { top: below, right: menuRight, backgroundColor: P.card, borderColor: P.border },
          ]}
        >
          <TouchableOpacity
            style={[styles.row, sharing.hidden && styles.disabled]}
            onPress={onToggleRecommend}
            disabled={saving !== null || sharing.hidden}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: recommended, disabled: saving !== null || sharing.hidden }}
            accessibilityLabel={`Recommend ${providerName}`}
          >
            <Ionicons name={recommended ? 'heart' : 'heart-outline'} size={19} color={recommended ? HEART : P.text} />
            <Text style={[styles.rowText, { color: P.text }]}>{recommended ? 'Recommended' : 'Recommend'}</Text>
            {saving === 'recommend' ? (
              <ActivityIndicator size="small" color={P.sub} />
            ) : recommended ? (
              <Ionicons name="checkmark" size={18} color={P.text} />
            ) : null}
          </TouchableOpacity>
          <View style={[styles.sep, { backgroundColor: P.border }]} />
          <TouchableOpacity
            style={styles.row}
            onPress={onToggleHidden}
            disabled={saving !== null}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: sharing.hidden, disabled: saving !== null }}
            accessibilityLabel={`Don't show me on ${providerName}'s cards`}
          >
            <Ionicons name="eye-off-outline" size={19} color={P.text} />
            <Text style={[styles.rowText, { color: P.text }]}>Don't show me on their cards</Text>
            {saving === 'hidden' ? (
              <ActivityIndicator size="small" color={P.sub} />
            ) : sharing.hidden ? (
              <Ionicons name="checkmark" size={18} color={P.text} />
            ) : null}
          </TouchableOpacity>
          <Text style={[styles.note, { color: P.sub }]}>{note}</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: HEART,
  },
  bubbleWrap: { position: 'absolute', width: 240 },
  bubbleArrow: { position: 'absolute', top: -6, width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  bubble: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    shadowColor: '#26201E',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bubbleText: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14 },
  rowText: { flex: 1, fontFamily: FONT_BODY, fontSize: 14, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth },
  note: { fontFamily: FONT_BODY, fontSize: 12, lineHeight: 17, paddingHorizontal: 14, paddingBottom: 13, paddingTop: 2 },
  disabled: { opacity: 0.5 },
});
