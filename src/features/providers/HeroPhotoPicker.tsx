// src/features/providers/HeroPhotoPicker.tsx
//
// Branding → Your Photos: the provider picks the portfolio photos their page
// style's hero opens on (Editorial 1, Snapshot 3, Hush 3; board "Branding ·
// pick the photos for any style that shows them" on
// https://claude.ai/artifact/L6KZ2rjSqidNWQ7r9sd8ee). Each pick carries the
// number of the slot it fills, in the order the hero shows them. Controlled:
// Branding keeps the picks and saves them with everything else
// (setHeroPortfolioPhotos).

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { isDarkColor } from '../../constants/providerThemes';
import type { DbPortfolioItem } from '../../types/database';
import { heroPhotos, toggleHeroPhotoPick } from './heroPhotos';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

export function HeroPhotoPicker({
  items,
  picked,
  onChange,
  limit,
  accent,
  subColor,
}: {
  /** Their work photos, newest first. */
  items: readonly DbPortfolioItem[];
  /** The ids picked. */
  picked: readonly string[];
  onChange: (next: string[]) => void;
  /** How many the hero shows. */
  limit: number;
  accent: string;
  subColor: string;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  // The slot each picked photo fills: the hero shows the picks in portfolio
  // order (heroPhotos), not the order they were tapped.
  const slotOf = useMemo(() => {
    const marked = items.map(item => ({ ...item, is_featured: picked.includes(item.id) }));
    const slots = new Map<string, number>();
    heroPhotos(marked, limit).forEach((item, index) => {
      if (item.is_featured) slots.set(item.id, index + 1);
    });
    return slots;
  }, [items, picked, limit]);
  const onAccent = isDarkColor(accent) ? '#FFFFFF' : '#1F1A1C';

  if (items.length === 0) {
    return (
      <Text style={[styles.empty, { color: subColor }]}>
        {tr('discover.page.addPhotosToYourPortfolioIn')}
      </Text>
    );
  }

  return (
    <View>
      <View style={styles.grid}>
        {items.map(item => {
          const slot = slotOf.get(item.id);
          const on = slot !== undefined;
          const full = !on && picked.length >= limit;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tile, on && { borderColor: accent }, full && styles.tileFull]}
              activeOpacity={0.85}
              onPress={() => {
                if (full) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                  return;
                }
                Haptics.selectionAsync().catch(() => {});
                onChange(toggleHeroPhotoPick(picked, item.id, limit));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: full }}
              accessibilityLabel={`${item.caption ? `Portfolio photo: ${item.caption}` : 'Portfolio photo'}${on ? `, shows ${limit === 1 ? 'at the top' : `in place ${slot}`}` : ''}`}
              accessibilityHint={full ? tr('discover.page.pickedLimit', { limit }) : undefined}
            >
              <Image source={{ uri: item.image_url }} style={styles.photo} contentFit="cover" transition={0} recyclingKey={item.id} />
              <View style={[styles.badge, on ? { backgroundColor: accent, borderColor: accent } : styles.badgeOff]}>
                {on ? <Text style={[styles.badgeText, { color: onAccent }]}>{slot}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Text style={[styles.count, { color: subColor }]}>
          {picked.length === 0 ? tr('discover.page.showingYourNewest') : tr('discover.page.pickedOf', { n: picked.length, total: limit })}
        </Text>
        {picked.length > 0 ? (
          <TouchableOpacity
            style={[styles.clear, { borderColor: accent }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange([]);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={tr('discover.page.clearYourPickedPhotos')}
          >
            <Text style={[styles.clearText, { color: accent }]}>{tr('common.clear')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '31.8%', aspectRatio: 1, borderRadius: 12, borderWidth: 3, borderColor: 'transparent', overflow: 'hidden' },
  tileFull: { opacity: 0.5 },
  photo: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeOff: { borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.2)' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, minHeight: 36 },
  count: { fontSize: 13, fontWeight: '600' },
  clear: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  clearText: { fontSize: 13, fontWeight: '600' },
});
