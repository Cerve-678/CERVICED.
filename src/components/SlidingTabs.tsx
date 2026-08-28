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
  /** Fills every inactive tab with this background (in addition to the
   *  active tab's sliding accent fill) instead of leaving it bare/outlined —
   *  for toggles where every option should read as a solid pill, not just
   *  the selected one. */
  inactiveBackgroundColor?: string;
  /** true (default): horizontal ScrollView, tabs size to their label — for
   *  rows with more tabs than comfortably fit (filters, categories). Note
   *  the ScrollView itself still stretches to fill its flex parent's width
   *  (RN default for `flex`-less ScrollViews), so a parent's
   *  `justifyContent: 'center'` has no visible effect in this mode — use
   *  `centerContent` instead if the row should center as a compact group.
   *  false: fixed row, tabs share the width equally — for 2-3 item segmented
   *  controls that should always fully fill their container. */
  scrollable?: boolean;
  /** Only used when `scrollable` is true. Renders tabs in a plain centered
   *  View instead of a ScrollView — for a small, always-fits tab count (e.g.
   *  a 2-item Upcoming/Past toggle) that should size to its labels AND sit
   *  centered as a group, rather than either stretching full-width
   *  (`scrollable={false}`) or left-aligning inside a full-width
   *  ScrollView (`scrollable` default). */
  centerContent?: boolean;
  /** Only used with `centerContent`. Makes every tab match the widest
   *  measured tab (via onLayout) instead of each sizing to its own label —
   *  e.g. a 2-item toggle where "Upcoming" and "Past" should read as the
   *  same size pill, not visibly different widths. */
  equalWidth?: boolean;
  /** Gap between tabs. Defaults to the original booking-history spacing
   *  (6, via each tab's own marginRight) — override per-instance rather
   *  than changing the default. */
  gap?: number;
  /** Font family for tab labels. Omit to keep the system default (existing
   *  screens' look) — set explicitly per-instance rather than changing the
   *  shared default, since this component is used by many screens. */
  tabFontFamily?: string;
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
  inactiveBackgroundColor,
  scrollable = true,
  centerContent = false,
  equalWidth = false,
  gap,
  tabFontFamily,
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
  // equalWidth: each tab first renders at its own natural size so we can
  // measure every label, then re-renders once at the shared max width —
  // a two-pass measure-then-apply, same trick as the indicator's own
  // onLayout-driven positioning below.
  const naturalWidths = useRef<Record<string, number>>({});
  const [sharedTabWidth, setSharedTabWidth] = useState<number | null>(null);

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
    if (scrollable && !centerContent) {
      scrollRef.current?.scrollTo({ x: Math.max(0, l.x - 32), animated });
    }
  }, [indicatorX, indicatorW, scrollable, centerContent, springSpeed, springBounciness]);

  const handleLayout = useCallback((key: string, x: number, width: number) => {
    const prev = layouts.current[key];
    const moved = !prev || prev.x !== x || prev.width !== width;
    layouts.current[key] = { x, width };

    if (indicatorReady) {
      // Already initialised: a tab can still be re-measured after this point —
      // equalWidth's second pass widens every tab from its natural size to the
      // shared max, a container resize or a late font load shifts them too.
      // handleLayout used to bail out here, leaving the indicator stuck at the
      // first-pass geometry, so the accent fill ended up narrower than the tab
      // it's meant to sit behind ("doesn't fill properly"). Re-snap it (no
      // animation — this is a layout correction, not a user action).
      if (moved && key === activeKey) slideTo(key, false);
      return;
    }

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

  const handleNaturalLayout = useCallback((key: string, width: number) => {
    if (sharedTabWidth !== null) return;
    naturalWidths.current[key] = width;
    if (Object.keys(naturalWidths.current).length === tabs.length) {
      setSharedTabWidth(Math.max(...Object.values(naturalWidths.current)));
    }
  }, [sharedTabWidth, tabs.length]);

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
      {tabs.map((tab, i) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            onLayout={e => {
              handleLayout(tab.key, e.nativeEvent.layout.x, e.nativeEvent.layout.width);
              if (equalWidth) handleNaturalLayout(tab.key, e.nativeEvent.layout.width);
            }}
            style={[
              styles.tab,
              { height },
              gap !== undefined && i > 0 ? { marginLeft: gap, marginRight: 0 } : null,
              !scrollable && styles.tabFill,
              equalWidth && sharedTabWidth !== null ? { minWidth: sharedTabWidth } : null,
              tabBorderColor ? { borderWidth: 1, borderColor: tabBorderColor, borderRadius: 18 } : null,
              !active && inactiveBackgroundColor ? { backgroundColor: inactiveBackgroundColor, borderRadius: 18 } : null,
            ]}
            onPress={() => onPress(tab.key)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.tabText,
                { color: active ? activeTextColor : inactiveTextColor, fontWeight: active ? '700' : '600' },
                tabFontFamily ? { fontFamily: tabFontFamily } : null,
              ]}
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

  if (centerContent) {
    // Plain View, not a ScrollView — a horizontal ScrollView stretches to
    // fill its flex parent regardless of content width, which silently
    // defeats a parent's `justifyContent: 'center'`. This sizes to the
    // tabs' actual content width so centering the row actually centers it.
    return <View style={containerStyle}>{row}</View>;
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
