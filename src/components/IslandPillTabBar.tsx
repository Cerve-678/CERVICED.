import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../contexts/ThemeContext';
import { useExploreFocusStore } from '../stores/useExploreFocusStore';
import { explorePillVisible } from '../utils/exploreTabBarScroll';
import {
  TAB_BAR_PILL_HEIGHT,
  TAB_BAR_SIDE_MARGIN,
  TAB_BAR_IOS_BOTTOM_OFFSET,
  tabBarContentHeight,
  tabBarIndicatorFrame,
  tabBarClearance,
  tabBarRect,
  type TabBarRect,
} from '../utils/tabBarGeometry';

// Two shapes, one component. iOS keeps the floating pill; Android uses the
// edge-anchored bar it expects, sized around the system navigation inset so it
// can't sit under the back/home/recents buttons. The measurements themselves
// live in utils/tabBarGeometry so the coach-mark tours that spotlight this bar
// read them from the same place rather than re-declaring them.
const IS_ANDROID = Platform.OS === 'android';

// iOS gets the real blur material; Android gets a plain view (see the render).
const Surface: React.ComponentType<any> = IS_ANDROID ? View : BlurView;

const H = TAB_BAR_PILL_HEIGHT;
const MARGIN = TAB_BAR_SIDE_MARGIN;
const INSET = 5;
const CONTENT_H = tabBarContentHeight(IS_ANDROID);

// This floats above every screen (it's the Tab.Navigator's `tabBar`, rendered
// as an overlay for every nested stack screen, not just the tab roots) — so a
// screen's own fixed-position footer (send button, submit button) needs at
// least this much bottom clearance or the bar visually covers it and blocks
// taps. Exported so those screens don't have to guess its footprint.
export const FLOATING_TAB_BAR_CLEARANCE = tabBarClearance(IS_ANDROID);

/**
 * Where the tab bar actually sits on screen, for the coach-mark tours that
 * spotlight it. The bar lives outside those screens' trees (it's the
 * Tab.Navigator's `tabBar`), so there is no ref to measure.
 */
export function tabBarSpotlightRect(
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
): TabBarRect {
  return tabBarRect(IS_ANDROID, screenWidth, screenHeight, bottomInset);
}

export default function IslandPillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  // The gap between the bar and the bottom of the screen. On Android that is
  // the system navigation bar's own inset — hardcoding it (it used to be a
  // flat 20) put the bar underneath the back/home/recents buttons on any
  // device using three-button navigation.
  const bottomOffset = IS_ANDROID ? insets.bottom : TAB_BAR_IOS_BOTTOM_OFFSET;
  const isExploreFocused = useExploreFocusStore(s => s.isExploreFocused);

  // explorePillVisible is a binary 0/1 driven by scroll *direction* (see
  // exploreTabBarScroll.ts) and animated with a spring, so the pill snaps
  // shown/hidden in one motion instead of continuously tracking every pixel
  // of scroll offset the way the old diffClamp-of-raw-scroll version did.
  // How far the bar travels (and fades) as Explore's grid scrolls down before
  // it's fully offscreen — far enough to clear its own height and inset.
  const hideDistance = CONTENT_H + bottomOffset + 24;
  const hideTranslateY = explorePillVisible.interpolate({
    inputRange: [0, 1],
    outputRange: [hideDistance + 20, 0],
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
    outputRange: [0, hideDistance + 20],
  });
  const forceHideOpacity = forceHideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  // Measured per render, not captured at module load: a frozen width is
  // wrong after rotation, in split-screen, and on a foldable unfolding.
  const { width: screenWidth } = useWindowDimensions();
  // Android spans the full width edge to edge; iOS floats inset from both sides.
  const barWidth = IS_ANDROID ? screenWidth : screenWidth - MARGIN * 2;

  const tabCount = state.routes.length;
  const tabWidth = barWidth / tabCount;
  // Sized and positioned against the bar's CONTENT height, so the highlight
  // lines up with the icons instead of drifting into the navigation inset.
  const indicatorFrame = tabBarIndicatorFrame(IS_ANDROID, tabWidth);

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
  }, [indicatorX, state.index, tabWidth]);

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
  // The iOS pill floats, so its border is a highlight around a translucent
  // surface. The Android bar is a docked edge — its border's job is to
  // separate the bar from the content scrolling underneath it, so it's a
  // contrast line rather than a highlight, and a full 1dp: a hairline on a
  // 3x-density Android screen is a third of a pixel and effectively invisible.
  const pillBorder = IS_ANDROID
    ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')
    : isDarkMode
      ? 'rgba(126,102,103,0.35)'
      : 'rgba(255,255,255,0.85)';
  // Explore's photo grid is busy/colourful enough that the pill's usual
  // resting opacity reads as too heavy over it — lighten both the blur and
  // the backing tint specifically there, independent of the scroll-driven
  // hide/show below. Still needs *some* tint + blur even lightened, though —
  // fully transparent with a weak blur left the icons with nothing behind
  // them to read against on light mode, disappearing into bright grid photos.
  //
  // Android doesn't take that treatment. expo-blur is only an approximation
  // there, so a mostly-transparent surface never resolves into readable
  // frosted glass the way it does on iOS — it just looks unfinished, with the
  // grid showing through the icons. The docked bar is painted as a near-solid
  // surface instead and leans on its top border and elevation for separation,
  // which is also what a native Android bottom bar does. It still lightens
  // slightly over Explore, just nowhere near to transparency.
  const androidBg = isExploreFocused
    ? (isDarkMode ? 'rgba(26,24,21,0.94)' : 'rgba(255,255,255,0.94)')
    : (isDarkMode ? 'rgba(26,24,21,0.98)' : 'rgba(255,255,255,0.97)');
  const pillBg = IS_ANDROID
    ? androidBg
    : isExploreFocused
      ? (isDarkMode ? 'rgba(26,24,21,0.55)' : 'rgba(255,255,255,0.4)')
      : (isDarkMode ? 'rgba(26,24,21,0.92)' : 'transparent');
  // iOS only — Android renders a plain View, so nothing reads these.
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
      <View
        {...panResponder.panHandlers}
        style={IS_ANDROID ? styles.gestureWrapperBar : styles.gestureWrapperPill}
      >
        {/* The bar floats over Explore's scrolling photo grid, so whatever
            backs it is recomposited every frame. On iOS the blur is the
            material and earns that. On Android the surface is painted at 97%
            opacity (expo-blur only approximates the effect there, so a
            translucent bar never resolved into readable glass) — the blur is
            invisible underneath it and costs a full-width composite per frame,
            which is a real part of why Explore scrolled roughly. Plain View
            there. */}
        <Surface
          {...(IS_ANDROID ? {} : { intensity: blurIntensity, tint: blurTint })}
          style={[
            IS_ANDROID ? styles.bar : styles.pill,
            { width: barWidth, borderColor: pillBorder, backgroundColor: pillBg },
            // The bar owns the system navigation inset as padding, so its
            // buttons stay above the nav bar while its surface still runs to
            // the bottom edge of the screen.
            IS_ANDROID && { height: CONTENT_H + bottomOffset, paddingBottom: bottomOffset },
          ]}
        >
          {/* Sliding indicator */}
          <Animated.View
            style={[
              styles.indicator,
              indicatorFrame,
              { backgroundColor: indicatorBg },
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
        </Surface>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Android sits flush against the bottom edge and spans the full width; the
  // nav-bar inset is handled as padding inside the bar itself, not as a gap
  // underneath it, so the surface reaches the edge the way a system bar does.
  container: IS_ANDROID
    ? { position: 'absolute', bottom: 0, left: 0, right: 0 }
    : { position: 'absolute', bottom: TAB_BAR_IOS_BOTTOM_OFFSET, left: MARGIN, right: MARGIN },
  gestureWrapperPill: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderRadius: H / 2,
  },
  gestureWrapperBar: {
    // Shadow points upward — the bar's only free edge is its top. Paired with
    // the border rather than replacing it: Android elevation alone renders as
    // a soft halo that reads as vague against a busy photo grid.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 12,
  },
  pill: {
    height: H,
    borderRadius: H / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  bar: {
    // Height and bottom padding come from the live inset at render time.
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  indicator: {
    // top/height/width/borderRadius come from tabBarIndicatorFrame.
    position: 'absolute',
    left: INSET,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // The bar's content height, NOT '100%' — on Android the bar's box includes
    // the navigation inset as padding, and stretching the buttons over it
    // pushed their icons down off-centre.
    height: CONTENT_H,
    zIndex: 1,
  },
});
