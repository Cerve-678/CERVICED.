// src/features/social/ProviderSharingRow.tsx
//
// On a provider's profile, for a client who has had a completed appointment
// with them: Recommend (a heart beside your face on their cards, for people
// who follow you) and "Don't show me on their cards". Renders nothing for
// anyone who can't recommend — the server decides that (get_my_provider_sharing).
//
// Hidden beats Recommend on the server (get_circle_for_providers drops a
// hidden provider's row whatever else is true), so Recommend is disabled
// while hidden, with a line saying why, rather than seeming to do nothing.
// The same goes for the master switch: while Show where I go is off nobody
// sees either, and the row says so.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyProviderSharing,
  setProviderHidden,
  setProviderRecommendation,
} from '../../services/databaseService';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { isDarkColor, type ProviderThemeTokens } from '../../constants/providerThemes';
import { FONT_BODY, FONT_DISPLAY, hapticLight, hapticSelection, hapticSuccess } from '../maintenance/ui';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';
import type { ProviderSharing } from './types';

interface Props {
  /** providers.id; null while the profile is still resolving. */
  providerId: string | null;
  providerName: string;
  /** Only a signed-in client viewing someone else's profile. */
  enabled: boolean;
  /** The provider's own profile palette, so the row sits in their page. */
  tokens: ProviderThemeTokens;
  accent: string;
  cardBg: string;
  onError: (title: string, message: string) => void;
}

export function ProviderSharingRow({ providerId, providerName, enabled, tokens: OP, accent, cardBg, onError }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // null until known, so the hint never claims who can see this on a guess.
  const showWhereIGo = useSocialSettingsStore((s) =>
    s.ownerId === userId && s.settings ? s.settings.showWhereIGo : null,
  );
  const [sharing, setSharing] = useState<ProviderSharing | null>(null);
  const [saving, setSaving] = useState<'recommend' | 'hidden' | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setSharing(null);
    if (!enabled || !providerId || !userId) return;
    // Independent: the settings only colour the hint, so their failure is logged, not shown.
    useSocialSettingsStore.getState().load(userId).catch((err: unknown) => {
      logger.warn('[sharing-row] could not load sharing settings', err);
    });
    getMyProviderSharing(providerId)
      .then((next) => { if (mine === seq.current) setSharing(next); })
      .catch((err: unknown) => {
        // Decoration on someone else's profile: without it the page is unchanged.
        logger.warn('[sharing-row] could not load recommend state', err);
      });
  }, [enabled, providerId, userId]);

  const toggleRecommend = useCallback(async () => {
    if (!providerId || !sharing || saving) return;
    const on = !sharing.recommended;
    setSaving('recommend');
    try {
      await setProviderRecommendation(providerId, on);
      setSharing((s) => (s ? { ...s, recommended: on } : s));
      if (on) hapticSuccess(); else hapticSelection();
    } catch (err) {
      onError(
        on ? "Couldn't recommend" : "Couldn't undo that",
        toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[sharing-row] set recommendation'),
      );
    } finally {
      setSaving(null);
    }
  }, [providerId, sharing, saving, onError]);

  const toggleHidden = useCallback(async (hidden: boolean) => {
    if (!providerId || !sharing || saving) return;
    setSaving('hidden');
    try {
      await setProviderHidden(providerId, hidden);
      setSharing((s) => (s ? { ...s, hidden } : s));
    } catch (err) {
      onError(
        "Couldn't save that",
        toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[sharing-row] set hidden'),
      );
    } finally {
      setSaving(null);
    }
  }, [providerId, sharing, saving, onError]);

  if (!enabled || !sharing?.canRecommend) return null;

  const recommended = sharing.recommended;
  // Text on the provider's accent: whichever of white or navy contrasts more.
  const onAccent = !/^#[0-9a-f]{6}$/i.test(accent) || isDarkColor(accent) ? '#FFFFFF' : '#1B2740';
  const fg = recommended ? onAccent : OP.text;
  const recommendDisabled = saving !== null || sharing.hidden;
  const hint = showWhereIGo === false
    ? 'Show where I go is off, so nobody sees this. You can change it in Beauty Profile → Your circle.'
    : sharing.hidden
      ? "You won't show on their cards, recommends included."
      : recommended && showWhereIGo
        ? 'People who follow you see a heart on your face on their cards.'
        : recommended
          ? 'You recommend them.'
          : 'Send people who follow you their way.';

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: OP.border }]}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: OP.sub }]}>YOU'VE BEEN HERE</Text>
          <Text style={[styles.body, { color: OP.text }]}>{hint}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.heartBtn,
            recommended
              ? { backgroundColor: accent, borderColor: accent }
              : { backgroundColor: 'transparent', borderColor: OP.border },
            recommendDisabled && styles.disabled,
          ]}
          onPress={() => { hapticLight(); void toggleRecommend(); }}
          disabled={recommendDisabled}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: recommended, disabled: recommendDisabled }}
          accessibilityLabel={`Recommend ${providerName}`}
        >
          {saving === 'recommend' ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <>
              <Ionicons name={recommended ? 'heart' : 'heart-outline'} size={15} color={fg} />
              <Text style={[styles.heartText, { color: fg }]}>
                {recommended ? 'RECOMMENDED' : 'RECOMMEND'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <View style={[styles.sep, { backgroundColor: OP.sep }]} />
      <View style={styles.hideRow}>
        <Text style={[styles.hideText, { color: OP.text }]}>Don't show me on their cards</Text>
        <Switch
          value={sharing.hidden}
          onValueChange={(v) => { hapticSelection(); void toggleHidden(v); }}
          disabled={saving !== null}
          trackColor={{ false: '#D1D1D6', true: accent }}
          thumbColor={sharing.hidden ? '#fff' : '#f4f3f4'}
          accessibilityLabel={`Don't show me on ${providerName}'s cards`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.6, marginBottom: 3 },
  body: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18 },
  heartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 120,
    justifyContent: 'center',
  },
  heartText: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1 },
  disabled: { opacity: 0.5 },
  sep: { height: StyleSheet.hairlineWidth },
  hideRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hideText: { flex: 1, fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700' },
});
