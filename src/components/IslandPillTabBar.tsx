import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../contexts/ThemeContext';
import { useExploreFocusStore } from '../stores/useExploreFocusStore';
import { explorePillVisible } from '../utils/exploreTabBarScroll';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H = 50;
const MARGIN = 32;
const PILL_WIDTH = SCREEN_WIDTH - MARGIN * 2;
const INSET = 5;
const BOTTOM_OFFSET = Platform.OS === 'ios' ? 30 : 20;
// How far the pill travels (and fades) as Explore's grid scrolls down before
// it's fully offscreen — clamped so it only ever tracks scroll in one
// direction's worth of distance, not the full scroll position.
const HIDE_DISTANCE = H + BOTTOM_OFFSET + 24;

// This floats above every screen (it's the Tab.Navigator's `tabBar`, rendered
// as an overlay for every nested stack screen, not just the tab roots) — so a
// screen's own fixed-position footer (send button, submit button) needs at
// least this much bottom clearance or the pill visually covers it and blocks
// taps. Exported so those screens don't have to guess the pill's footprint.
export const FLOATING_TAB_BAR_CLEARANCE = BOTTOM_OFFSET + H + 10;

export default function IslandPillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDarkMode } = useTheme();
  const isExploreFocused = useExploreFocusStore(s => s.isExploreFocused);

  // explorePillVisible is a binary 0/1 driven by scroll *direction* (see
  // exploreTabBarScroll.ts) and animated with a spring, so the pill snaps
  // shown/hidden in one motion instead of continuously tracking every pixel
  // of scroll offset the way the old diffClamp-of-raw-scroll version did.
  const hideTranslateY = explorePillVisible.interpolate({
    inputRange: [0, 1],
    outputRange: [HIDE_DISTANCE + 20, 0],
  });
  const hideOpacity = explorePillVisible;

  // Lets an individual screen hide the pill entirely — e.g. ProviderProfile
  // hides it until the client has something in the cart, since the pill
  // covers the multi-select "Book" bar otherwise. A screen opts in the
  // standard React Navigation way: navigation.getParent()?.setOptions({
  // tabBarStyle: { display: 'none' } }) (and back to `undefined` to show it
  // again) — read here from the currently *focused tab's* own route
  // options, which is where setOptions via getParent() actually lands.
  // Composed with the scroll-hide values below (not just a second style
  // object) so this is a true no-op for every screen that never sets it.
  const focusedRouteOptions = descriptors[state.routes[state.index]?.key ?? '']?.options;
  const forceHidden = (focusedRouteOptions?.tabBarStyle as { display?: string } | undefined)?.display === 'none';
  const forceHideProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(forceHideProgress, {
      toValue: forceHidden ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [forceHidden, forceHideProgress]);
  const forceHideTranslateY = forceHideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, HIDE_DISTANCE + 20],
  });
  const forceHideOpacity = forceHideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const tabCount = state.routes.length;
  const tabWidth = PILL_WIDTH / tabCount;

  // Refs keep pan responder callbacks fresh
  const tabWidthRef     = useRef(tabWidth);
  const tabCountRef     = useRef(tabCount);
  const currentIdxRef   = useRef(state.index);
  const navigationRef   = useRef(navigation);
  const routesRef       = useRef(state.routes);
  const dragStartX      = useRef(0);

  useEffect(() => {
    tabWidthRef.current   = tabWidth;
    tabCountRef.current   = tabCount;
    currentIdxRef.current = state.index;
    navigationRef.current = navigation;
    routesRef.current     = state.routes;
  });

  const indicatorX = useRef(new Animated.Value(state.index * tabWidth)).current;

  // Sync indicator when navigation changes programmatically
  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: state.index * tabWidth,
      damping: 22,
      stiffness: 280,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [state.index]);

  const goToTab = (index: number) => {
    const clamped = Math.max(0, Math.min(tabCountRef.current - 1, index));
    Animated.spring(indicatorX, {
      toValue: clamped * tabWidthRef.current,
      damping: 22,
      stiffness: 280,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
    if (clamped !== currentIdxRef.current) {
      const route = routesRef.current[clamped];
      if (!route) return;
      const event = navigationRef.current.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      } as any);
      if (!(event as any).defaultPrevented) {
        navigationRef.current.navigate(route.name as never);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
  };

  // PanResponder only activates on clear horizontal drags — taps fall through to buttons
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,

      onPanResponderGrant: (_, { dx }) => {
        // dx is already non-zero when we claim; compensate so indicator starts from current tab
        dragStartX.current = currentIdxRef.current * tabWidthRef.current - dx;
      },

      onPanResponderMove: (_, { dx }) => {
        const max = (tabCountRef.current - 1) * tabWidthRef.current;
        indicatorX.setValue(
          Math.max(0, Math.min(max, dragStartX.current + dx))
        );
      },

      onPanResponderRelease: (_, { dx }) => {
        const tw  = tabWidthRef.current;
        const max = (tabCountRef.current - 1) * tw;
        const rawX = Math.max(0, Math.min(max, dragStartX.current + dx));
        goToTab(Math.round(rawX / tw));
      },

      onPanResponderTerminate: (_, { dx }) => {
        const tw  = tabWidthRef.current;
        const max = (tabCountRef.current - 1) * tw;
        const rawX = Math.max(0, Math.min(max, dragStartX.current + dx));
        goToTab(Math.round(rawX / tw));
      },
    })
  ).current;

  const activeColor   = isDarkMode ? '#F0ECE7' : '#1C1C1E';
  const inactiveColor = isDarkMode ? 'rgba(240,236,231,0.45)' : 'rgba(0,0,0,0.38)';
  const indicatorBg   = isDarkMode ? 'rgba(175,145,151,0.25)' : 'rgba(0,0,0,0.07)';
  const blurTint      = isDarkMode
    ? ('systemUltraThinMaterialDark' as const)
    : ('systemUltraThinMaterialLight' as const);
  const pillBorder    = isDarkMode
    ? 'rgba(126,102,103,0.35)'
    : 'rgba(255,255,255,0.85)';
  // Explore's photo grid is busy/colourful enough that the pill's usual
  // resting opacity reads as too heavy over it — lighten both the blur and
  // the backing tint specifically there, independent of the scroll-driven
  // hide/show below. Still needs *some* tint + blur even lightened, though —
  // fully transparent with a weak blur left the icons with nothing behind
  // them to read against on light mode, disappearing into bright grid photos.
  const pillBg = isExploreFocused
    ? (isDarkMode ? 'rgba(26,24,21,0.55)' : 'rgba(255,255,255,0.4)')
    : (isDarkMode ? 'rgba(26,24,21,0.92)' : 'transparent');
  const blurIntensity = isExploreFocused
    ? (isDarkMode ? 22 : 18)
    : (isDarkMode ? 40 : 22);

  // Combined (not just concatenated) with the scroll-hide values above —
  // two style objects in one array can't both contribute to `transform`,
  // the later one fully replaces it, which would silently cancel whichever
  // hide reason came first. Animated.add/multiply compose them properly:
  // translateY sums (either reason pushes it further down), opacity
  // multiplies (either reason reaching 0 hides it, regardless of the
  // other). scrollHide* fall back to identity values (0 / 1) off Explore,
  // where they're not meant to apply at all.
  const scrollHideTranslateY = isExploreFocused ? hideTranslateY : 0;
  const scrollHideOpacity = isExploreFocused ? hideOpacity : 1;
  const combinedTranslateY = Animated.add(scrollHideTranslateY, forceHideTranslateY);
  const combinedOpacity = Animated.multiply(scrollHideOpacity, forceHideOpacity);

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: combinedTranslateY }], opacity: combinedOpacity },
      ]}
      pointerEvents={forceHidden ? 'none' : 'box-none'}
    >
      <View {...panResponder.panHandlers} style={styles.gestureWrapper}>
        <BlurView
          intensity={blurIntensity}
          tint={blurTint}
          style={[styles.pill, { borderColor: pillBorder, backgroundColor: pillBg }]}
        >
          {/* Sliding indicator */}
          <Animated.View
            style={[
              styles.indicator,
              { width: tabWidth - INSET * 2, backgroundColor: indicatorBg },
              { transform: [{ translateX: indicatorX }] },
            ]}
          />

          {/* Tab buttons */}
          {state.routes.map((route, index) => {
            const options = descriptors[route.key]?.options;
            const isFocused = state.index === index;
            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tab}
                onPress={() => goToTab(index)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
              >
                {options?.tabBarIcon?.({
                  focused: isFocused,
                  color: isFocused ? activeColor : inactiveColor,
                  size: 24,
                })}
              </TouchableOpacity>
            );
          })}
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: BOTTOM_OFFSET,
    left: MARGIN,
    right: MARGIN,
  },
  gestureWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderRadius: H / 2,
  },
  pill: {
    width: PILL_WIDTH,
    height: H,
    borderRadius: H / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  indicator: {
    position: 'absolute',
    left: INSET,
    height: H - INSET * 2,
    borderRadius: (H - INSET * 2) / 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
});
