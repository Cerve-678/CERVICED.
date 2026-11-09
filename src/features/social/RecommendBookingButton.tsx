// src/features/social/RecommendBookingButton.tsx
//
// On a completed booking: "Recommend <provider>" / "Recommended", tap again
// to undo. Renders nothing unless the server says this client can recommend
// them (get_my_provider_sharing) and hasn't hidden them.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyProviderSharing } from '../../services/databaseService';
import { recommendProvider } from './recommend';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { logger } from '../../utils/logger';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { hapticSelection, hapticSuccess } from '../maintenance/ui';
import type { ProviderSharing } from './types';

const HEART = '#FF2D78';

interface Props {
  userId: string | null;
  providerId: string | null | undefined;
  providerName: string;
  /** Change it to re-read (e.g. after the rating bar recommended them). */
  refreshKey?: number | undefined;
  textColour: string;
  subColour: string;
  onError: (title: string, message: string) => void;
}

export function RecommendBookingButton({ userId, providerId, providerName, refreshKey, textColour, subColour, onError }: Props) {
  const [sharing, setSharing] = useState<ProviderSharing | null>(null);
  const [saving, setSaving] = useState(false);
  const showWhereIGo = useSocialSettingsStore((s) =>
    s.ownerId === userId && s.settings ? s.settings.showWhereIGo : null,
  );
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!userId || !providerId) { setSharing(null); return; }
    useSocialSettingsStore.getState().load(userId).catch((err: unknown) => {
      logger.warn('[recommend-booking] could not load sharing settings', err);
    });
    getMyProviderSharing(providerId)
      .then((next) => { if (mine === seq.current) setSharing(next); })
      .catch((err: unknown) => {
        // Decoration on the booking: without it the page is unchanged.
        logger.warn('[recommend-booking] could not load recommend state', err);
      });
  }, [userId, providerId, refreshKey]);

  const toggle = useCallback(async () => {
    if (!providerId || !sharing || saving) return;
    const on = !sharing.recommended;
    setSaving(true);
    try {
      await recommendProvider(providerId, on);
      setSharing((s) => (s ? { ...s, recommended: on } : s));
      if (on) hapticSuccess(); else hapticSelection();
    } catch (err) {
      onError(
        on ? "Couldn't recommend" : "Couldn't undo that",
        toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[recommend-booking] toggle'),
      );
    } finally {
      setSaving(false);
    }
  }, [providerId, sharing, saving, onError]);

  if (!sharing || !sharing.canRecommend || sharing.hidden) return null;
  const on = sharing.recommended;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, { borderColor: HEART, backgroundColor: on ? HEART : 'rgba(255,45,120,0.10)' }]}
        onPress={() => void toggle()}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={on ? `Recommended ${providerName}. Tap to undo` : `Recommend ${providerName}`}
      >
        {saving ? <ActivityIndicator size="small" color={on ? '#FFFFFF' : HEART} /> : (
          <>
            <Ionicons name={on ? 'heart' : 'heart-outline'} size={16} color={on ? '#FFFFFF' : HEART} />
            <Text style={[styles.text, { color: on ? '#FFFFFF' : textColour }]} numberOfLines={1}>
              {on ? 'Recommended' : `Recommend ${providerName}`}
            </Text>
          </>
        )}
      </TouchableOpacity>
      {showWhereIGo === false ? (
        <Text style={[styles.hint, { color: subColour }]}>Only you can see this while sharing is off.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  btn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  text: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  hint: { fontSize: 12, textAlign: 'center' },
});
