// src/features/social/RecommendBookingButton.tsx
//
// On a completed booking: a quiet Recommend / Recommended chip, tap again to
// undo. Renders nothing unless the server says this client can recommend them
// (get_my_provider_sharing) and hasn't hidden them.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyProviderSharing } from '../../services/databaseService';
import { recommendProvider } from './recommend';
import { logger } from '../../utils/logger';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { hapticSelection, hapticSuccess } from '../maintenance/ui';
import type { ProviderSharing } from './types';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface Props {
  userId: string | null;
  providerId: string | null | undefined;
  providerName: string;
  /** Change it to re-read (e.g. after the rating bar recommended them). */
  refreshKey?: number | undefined;
  textColour: string;
  borderColour: string;
  onError: (title: string, message: string) => void;
}

export function RecommendBookingButton({ userId, providerId, providerName, refreshKey, textColour, borderColour, onError }: Props) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const [sharing, setSharing] = useState<ProviderSharing | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!userId || !providerId) { setSharing(null); return; }
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
        style={[styles.btn, { borderColor: borderColour, backgroundColor: on ? 'rgba(127,127,127,0.10)' : 'transparent' }]}
        onPress={() => void toggle()}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={on ? tr('shared.newc2.recommendedUndo', { name: providerName }) : tr('shared.newc2.recommendName', { name: providerName })}
      >
        {saving ? <ActivityIndicator size="small" color={textColour} /> : (
          <>
            <Ionicons name={on ? 'thumbs-up' : 'thumbs-up-outline'} size={15} color={textColour} />
            <Text style={[styles.text, { color: textColour }]} numberOfLines={1}>
              {on ? tr('shared.newc.recommended') : tr('shared.newc.recommend')}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', marginTop: 8, gap: 4 },
  btn: {
    width: '72%',
    maxWidth: 280,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  text: { fontSize: 13, fontWeight: '600' },
});
