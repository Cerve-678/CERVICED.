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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H = 50;
const MARGIN = 32;
const PILL_WIDTH = SCREEN_WIDTH - MARGIN * 2;
const INSET = 5;

export default function IslandPillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDarkMode } = useTheme();

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
  const pillBg        = isDarkMode ? 'rgba(26,24,21,0.92)' : 'transparent';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View {...panResponder.panHandlers} style={styles.gestureWrapper}>
        <BlurView
          intensity={isDarkMode ? 40 : 22}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
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
