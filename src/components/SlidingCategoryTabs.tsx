// SlidingCategoryTabs.tsx
// Shared category-tab row for Offers/Search — a black capsule slides behind
// the selected CategoryTabPill (spring-animated to the tapped pill's
// measured position/width, same spring as the bottom island tab bar), on
// top of that pill's own instant colour swap, so switching categories reads
// as one continuous slide instead of a flat instant swap.
import React, { useCallback, useRef } from 'react';
import { Animated, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import CategoryTabPill from './CategoryTabPill';

export interface SlidingCategoryTabsProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  isDarkMode: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  activeColor?: string;
  activeTextColor?: string;
}

const DEFAULT_ACTIVE = '#000000';
const DEFAULT_ACTIVE_TEXT = '#FFFFFF';

export default function SlidingCategoryTabs({
  categories,
  selected,
  onSelect,
  surfaceColor,
  borderColor,
  textColor,
  isDarkMode,
  contentContainerStyle,
  activeColor = DEFAULT_ACTIVE,
  activeTextColor = DEFAULT_ACTIVE_TEXT,
}: SlidingCategoryTabsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);
  const lastFocused = useRef<string | null>(null);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;
  const indicatorReady = useRef(false);

  const moveIndicator = useCallback((category: string) => {
    const layout = layouts.current[category];
    if (!layout) return;
    if (!indicatorReady.current) {
      indicatorX.setValue(layout.x);
      indicatorWidth.setValue(layout.width);
      indicatorReady.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: layout.x, useNativeDriver: false, damping: 22, stiffness: 280, mass: 0.7,
      }),
      Animated.spring(indicatorWidth, {
        toValue: layout.width, useNativeDriver: false, damping: 22, stiffness: 280, mass: 0.7,
      }),
    ]).start();
  }, [indicatorX, indicatorWidth]);

  // Keeps the selected chip visible when selection changes from off-screen
  // (e.g. arriving pre-filtered) — centers it in the scrollable row.
  const focusActive = useCallback((category: string) => {
    const layout = layouts.current[category];
    if (!layout) return;
    lastFocused.current = category;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const viewport = viewportWidth.current;
    const targetX = viewport ? layout.x - viewport / 2 + layout.width / 2 : layout.x - 20;
    scroller.scrollTo({ x: Math.max(0, targetX), animated: true });
  }, []);

  React.useEffect(() => {
    focusActive(selected);
    moveIndicator(selected);
  }, [selected, focusActive, moveIndicator]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      onLayout={(e) => { viewportWidth.current = e.nativeEvent.layout.width; }}
    >
      <View style={styles.row}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { backgroundColor: activeColor, transform: [{ translateX: indicatorX }], width: indicatorWidth },
          ]}
        />
        {categories.map(category => {
          const active = category === selected;
          return (
            <View
              key={category}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                layouts.current[category] = { x, width };
                if (category === selected) {
                  if (lastFocused.current !== category) focusActive(category);
                  moveIndicator(category);
                }
              }}
            >
              <CategoryTabPill
                category={category}
                isSelected={active}
                onPress={() => onSelect(category)}
                cardBg={active ? activeColor : surfaceColor}
                blurIntensity={20}
                blurTint={isDarkMode ? 'dark' : 'light'}
                borderColor={active ? 'transparent' : borderColor}
                textColor={active ? activeTextColor : textColor}
              />
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 22,
  },
});
