import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useCollectionsStore, type CollectionHost } from '../../stores/useCollectionsStore';

const SHOW_FOR_MS = 4500;

interface CollectionOfferBarProps {
  host: CollectionHost;
  /** Distance from the bottom of the screen. */
  bottom: number;
}

/**
 * The "Saved · Add to a collection" bar that slides up after a heart. It
 * goes away by itself; the heart has already saved to Favourites, so
 * ignoring it loses nothing.
 */
export function CollectionOfferBar({ host, bottom }: CollectionOfferBarProps) {
  const { palette: P } = useTheme();
  const offer = useCollectionsStore(s => s.offer);
  const clearOffer = useCollectionsStore(s => s.clearOffer);
  const openSheet = useCollectionsStore(s => s.openSheet);

  const mine = offer?.host === host ? offer : null;
  const [shownItemId, setShownItemId] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!mine) {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setShownItemId(null); });
      return;
    }
    setShownItemId(mine.itemId);
    Animated.spring(anim, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      if (useCollectionsStore.getState().offer?.key === mine.key) clearOffer();
    }, SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [mine?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shownItemId) return null;

  return (
    <Animated.View
      pointerEvents={mine ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        {
          bottom,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: P.accent }]}>
        <Ionicons name="heart" size={16} color="#FF2D78" />
        <Text style={[styles.text, { color: P.onAccent }]} numberOfLines={1}>Saved</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            openSheet(shownItemId, host);
          }}
          style={[styles.action, { backgroundColor: P.onAccent }]}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Ionicons name="folder-open-outline" size={15} color={P.accent} />
          <Text style={[styles.actionText, { color: P.accent }]}>Add to a collection</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '700', fontSize: 15, marginRight: 6 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
  },
  actionText: { fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '700', fontSize: 14 },
});
