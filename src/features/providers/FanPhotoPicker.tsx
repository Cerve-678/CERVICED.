// src/features/providers/FanPhotoPicker.tsx
//
// Branding → Your Photos (Hush, three boxes) / Your Fan (Pearl, a fan of
// five): the provider picks the portfolio photos that open those page styles (board "Branding — pick your
// fan photos" on https://claude.ai/artifact/LPquiWNrboArq6NjcZi9ny). A live
// fan of the picks sits above their portfolio grid. Controlled: Branding
// keeps the picks and saves them with everything else (setFanPortfolioPhotos).

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { isDarkColor } from '../../constants/providerThemes';
import type { DbPortfolioItem } from '../../types/database';
import { fanPhotos, toggleFanPick } from './fanPhotos';
import { HeroFan, HushBoxes } from './heroes/DemureHeroes';

export function FanPhotoPicker({
  items,
  picked,
  onChange,
  limit,
  variant,
  sheet,
  accent,
  textColor,
  subColor,
  borderColor,
}: {
  /** Their work photos, newest first. */
  items: readonly DbPortfolioItem[];
  /** The ids picked, in the order they were picked. */
  picked: readonly string[];
  onChange: (next: string[]) => void;
  /** How many the hero shows: Hush 3, Pearl 5. */
  limit: number;
  /** Hush draws three boxes, Pearl a fan of pearl-edged photos. */
  variant: 'boxes' | 'pearls';
  sheet: string;
  accent: string;
  textColor: string;
  subColor: string;
  borderColor: string;
}) {
  // What the fan will show: the picks, or the newest photos when none are picked.
  const fanUris = useMemo(() => {
    const marked = items.map(item => ({ ...item, is_featured: picked.includes(item.id) }));
    return fanPhotos(marked, limit).map(item => item.image_url);
  }, [items, picked, limit]);
  const onAccent = isDarkColor(accent) ? '#FFFFFF' : '#1F1A1C';

  if (items.length === 0) {
    return (
      <Text style={[styles.empty, { color: subColor }]}>
        Add photos to your portfolio in My Profile and they'll fan out here.
      </Text>
    );
  }

  return (
    <View>
      <View style={[styles.preview, { backgroundColor: sheet, borderColor }]}>
        {variant === 'boxes' ? (
          <View style={styles.boxesPad}><HushBoxes uris={fanUris} paper={sheet} /></View>
        ) : (
          <HeroFan uris={fanUris} paper={sheet} />
        )}
      </View>
      <View style={styles.countRow}>
        <Text style={[styles.countLabel, { color: textColor }]}>Your portfolio</Text>
        <Text style={[styles.count, { color: subColor }]}>
          {picked.length === 0 ? 'Showing your newest' : `${picked.length} of ${limit} picked`}
        </Text>
      </View>
      <View style={styles.grid}>
        {items.map(item => {
          const on = picked.includes(item.id);
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
                onChange(toggleFanPick(picked, item.id, limit));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: full }}
              accessibilityLabel={item.caption ? `Portfolio photo: ${item.caption}` : 'Portfolio photo'}
              accessibilityHint={full ? `You've picked ${limit}. Untick one to swap it.` : undefined}
            >
              <Image source={{ uri: item.image_url }} style={styles.photo} contentFit="cover" transition={0} recyclingKey={item.id} />
              <View style={[styles.tick, on ? { backgroundColor: accent, borderColor: accent } : styles.tickOff]}>
                {on ? <Ionicons name="checkmark" size={14} color={onAccent} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18 },
  boxesPad: { padding: 14 },
  preview: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 14 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  countLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  count: { fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '31.8%', aspectRatio: 0.82, borderRadius: 14, borderWidth: 3, borderColor: 'transparent', overflow: 'hidden' },
  tileFull: { opacity: 0.5 },
  photo: { width: '100%', height: '100%' },
  tick: {
    position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  tickOff: { borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.2)' },
});
