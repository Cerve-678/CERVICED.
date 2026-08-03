// SlidingTabs.tsx
// Shared tab/segment row — a colour-filled capsule springs behind whichever
// tab is active (measured via onLayout, animated with Animated.spring on
// translateX + width), with active label text turning white on top of it.
// This is the "booking history" tab look (originally ProviderBookingHistoryScreen's
// local SlidingTabs) promoted to a shared component so every hand-rolled
// tab/segment switcher in the app can look and animate the same way.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

export interface SlidingTabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

export interface SlidingTabsProps<K extends string = string> {
  tabs: readonly SlidingTabItem<K>[];
  /** null means "no tab currently active" — the indicator hides rather than
   *  pointing at any tab. Needed for toggle-style filters that can clear back
   *  to an unfiltered/default state (e.g. tapping the active filter again). */
  activeKey: K | null;
  onPress: (key: K) => void;
  accentColor: string;
  inactiveTextColor: string;
  activeTextColor?: string;
  /** true (default): horizontal ScrollView, tabs size to their label — for
   *  rows with more tabs than comfortably fit (filters, categories).
   *  false: fixed row, tabs share the width equally — for 2-3 item segmented
   *  controls that should always fully fill their container. */
  scrollable?: boolean;
  height?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Outlines every tab (active and inactive) so a toggle that can start with
   *  nothing selected — the sliding indicator is hidden then, see
   *  `activeKey === null` above — still reads as a row of buttons instead of
   *  bare floating text. Omit for the default look (no border). */
  tabBorderColor?: string;
  /** Indicator spring feel. Defaults match the original booking-history
   *  tabs — override per-instance rather than changing the default, since
   *  this component is shared and other screens' tabs shouldn't shift too. */
  springBounciness?: number;
  springSpeed?: number;
}

export default function SlidingTabs<K extends string = string>({
  tabs,
  activeKey,
  onPress,
  accentColor,
  inactiveTextColor,
  activeTextColor = '#fff',
  scrollable = true,
  height = 36,
  containerStyle,
  tabBorderColor,
  springBounciness = 6,
  springSpeed = 18,
}: SlidingTabsProps<K>) {
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const [indicatorReady, setIndicatorReady] = useState(false);

  const slideTo = useCallback((key: string, animated: boolean) => {
    const l = layouts.current[key];
    if (!l) return;
    if (animated) {
      Animated.parallel([
        Animated.spring(indicatorX, { toValue: l.x, useNativeDriver: false, speed: springSpeed, bounciness: springBounciness }),
        Animated.spring(indicatorW, { toValue: l.width, useNativeDriver: false, speed: springSpeed, bounciness: springBounciness }),
      ]).start();
    } else {
      indicatorX.setValue(l.x);
      indicatorW.setValue(l.width);
    }
    if (scrollable) {
      scrollRef.current?.scrollTo({ x: Math.max(0, l.x - 32), animated });
    }
  }, [indicatorX, indicatorW, scrollable, springSpeed, springBounciness]);

  const handleLayout = useCallback((key: string, x: number, width: number) => {
    layouts.current[key] = { x, width };
    if (indicatorReady) return;
    if (key === activeKey) {
      // Snap straight to the active tab's position (no animation) the
      // moment we know it, then readiness lets the effect below take over.
      slideTo(key, false);
      setIndicatorReady(true);
    } else if (activeKey === null) {
      // Toggle-style filters (e.g. Upcoming/Past Bookings) can start with no
      // tab selected — there's nothing to snap to yet, but layouts are known
      // now, so mark ready so a later tap can animate in immediately instead
      // of silently never showing a fill at all.
      setIndicatorReady(true);
    }
  }, [activeKey, indicatorReady, slideTo]);

  useEffect(() => {
    if (indicatorReady && activeKey !== null) slideTo(activeKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const row = (
    <View style={[styles.row, { height }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            height,
            backgroundColor: accentColor,
            opacity: indicatorReady && activeKey !== null ? 1 : 0,
            width: indicatorW,
            transform: [{ translateX: indicatorX }],
          },
        ]}
      />
      {tabs.map(tab => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            onLayout={e => handleLayout(tab.key, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
            style={[
              styles.tab,
              { height },
              !scrollable && styles.tabFill,
              tabBorderColor ? { borderWidth: 1, borderColor: tabBorderColor, borderRadius: 18 } : null,
            ]}
            onPress={() => onPress(tab.key)}
            activeOpacity={0.75}
          >
            <Text
              style={[styles.tabText, { color: active ? activeTextColor : inactiveTextColor, fontWeight: active ? '700' : '600' }]}
              numberOfLines={1}
            >
              {tab.label}{tab.count && tab.count > 0 ? `  ${tab.count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!scrollable) {
    // flex: 1 (not width: '100%') because the parent handing us this space
    // is typically itself flexDirection: 'row' with us as its only child —
    // a row container doesn't stretch children along its main axis by
    // default, so without this the whole bar can collapse to zero width.
    return <View style={[styles.fillWrapper, containerStyle]}>{row}</View>;
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={containerStyle}
    >
      {row}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', position: 'relative' },
  fillWrapper: { flex: 1 },
  indicator: { position: 'absolute', top: 0, borderRadius: 18 },
  tab: { paddingHorizontal: 16, marginRight: 6, alignItems: 'center', justifyContent: 'center' },
  tabFill: { flex: 1, marginRight: 0 },
  tabText: { fontSize: 13.5, letterSpacing: -0.1 },
});
