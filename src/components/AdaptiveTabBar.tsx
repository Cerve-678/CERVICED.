import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { GlassView, GlassContainer, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

// Pill indicator dimensions
const PILL_HEIGHT = 40;
const PILL_RADIUS = PILL_HEIGHT / 2;

interface AdaptiveTabBarProps extends BottomTabBarProps {}

const AdaptiveTabBar: React.FC<AdaptiveTabBarProps> = (props) => {
  if (Platform.OS === 'ios') {
    return <IOSGlassTabBar {...props} />;
  }
  return <AndroidMaterialTabBar {...props} />;
};

// ====================================================================
// ==================== iOS GLASS TAB BAR ====================
// ====================================================================
const IOSGlassTabBar: React.FC<AdaptiveTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme, isDarkMode } = useTheme();
  const glassAvailable = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const pillWidth = Math.min(Dimensions.get('window').width - 96, 360);
  const tabCount = state.routes.length;
  // Account for paddingHorizontal: 6 on the tab row so pill centers correctly
  const TAB_H_PAD = 6;
  const innerWidth = pillWidth - TAB_H_PAD * 2;
  const tabWidth = innerWidth / tabCount;
  const pillIndW = tabWidth - 8;   // 4px breathing room each side within the slot
  const pillIndLeft = TAB_H_PAD + 4; // aligns with slot left edge + centering offset
  const colorScheme = isDarkMode ? 'dark' : 'light';

  // Keep a mutable ref to current state for use inside PanResponder callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const indicatorTranslateX = useRef(
    new Animated.Value(state.index * tabWidth)
  ).current;

  useEffect(() => {
    Animated.spring(indicatorTranslateX, {
      toValue: state.index * tabWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }, [state.index, tabWidth]);

  // PanResponder for drag-to-navigate
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const s = stateRef.current;
        const iw = pillWidth - TAB_H_PAD * 2;
        const tw = iw / s.routes.length;
        const raw = s.index * tw + g.dx;
        const clamped = Math.max(0, Math.min(raw, (s.routes.length - 1) * tw));
        indicatorTranslateX.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const s = stateRef.current;
        const iw = pillWidth - TAB_H_PAD * 2;
        const tw = iw / s.routes.length;
        const raw = s.index * tw + g.dx;
        const clamped = Math.max(0, Math.min(raw, (s.routes.length - 1) * tw));
        const targetIdx = Math.round(clamped / tw);

        Animated.spring(indicatorTranslateX, {
          toValue: targetIdx * tw,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
        }).start();

        const targetRoute = s.routes[targetIdx];
        if (targetIdx !== s.index && targetRoute) {
          navigation.navigate(targetRoute.name);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const tabs = state.routes.map((route, index) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return null;

    const { options } = descriptor;
    const label =
      options.tabBarLabel !== undefined
        ? options.tabBarLabel
        : options.title !== undefined
        ? options.title
        : route.name;

    const isFocused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    };

    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={`${typeof label === 'string' ? label : route.name} tab`}
        onPress={onPress}
        onLongPress={onLongPress}
        style={iosStyles.tabButton}
        activeOpacity={0.6}
      >
        <View style={iosStyles.iconContainer}>
          {options.tabBarIcon?.({
            focused: isFocused,
            color: isDarkMode ? '#FFFFFF' : (isFocused ? '#1C1C1E' : '#8E8E93'),
            size: 22,
          })}
        </View>
      </TouchableOpacity>
    );
  });

  // Sliding glass pill — layered for real glass look
  const slidingPill = (
    <Animated.View
      style={[
        iosStyles.slidingPill,
        isDarkMode && iosStyles.slidingPillDark,
        {
          width: pillIndW,
          left: pillIndLeft,
          transform: [{ translateX: indicatorTranslateX }],
        },
      ]}
    >
      {/* Inner top-edge glint — simulates light catching the curved rim */}
      <View style={iosStyles.pillGlint} />
    </Animated.View>
  );

  const tabBar = !glassAvailable ? (
    <View style={iosStyles.container}>
      <View style={[iosStyles.shadowGlow, { width: pillWidth + 16 }]} />
      {/* PanResponder on the pill container — captures drag after TouchableOpacity releases */}
      <View
        {...panResponder.panHandlers}
        style={[iosStyles.glassPillContainer, { width: pillWidth }]}
      >
        <BlurView
          intensity={55}
          tint={theme.blurTint}
          style={[iosStyles.blurLayer, isDarkMode && iosStyles.blurLayerDark]}
        >
          <View style={[iosStyles.frostLayer, isDarkMode && iosStyles.frostLayerDark]}>
            <View style={iosStyles.indicatorContainer}>
              {slidingPill}
            </View>
            <View style={iosStyles.tabBar}>{tabs}</View>
          </View>
        </BlurView>
        <View style={[iosStyles.topEdgeHighlight, isDarkMode && iosStyles.topEdgeHighlightDark]} pointerEvents="none" />
      </View>
    </View>
  ) : (
    <View style={iosStyles.container}>
      <View style={[iosStyles.shadowGlow, { width: pillWidth + 16 }]} />
      <View
        {...panResponder.panHandlers}
        style={[iosStyles.glassPillContainer, { width: pillWidth }]}
      >
        <GlassContainer spacing={10} style={StyleSheet.absoluteFill}>
          <GlassView
            glassEffectStyle="regular"
            colorScheme={colorScheme}
            style={StyleSheet.absoluteFill}
          />
          <AnimatedGlassView
            glassEffectStyle="clear"
            colorScheme={colorScheme}
            style={{
              position: 'absolute',
              top: '50%',
              marginTop: -(PILL_HEIGHT / 2),
              left: pillIndLeft,
              width: pillIndW,
              height: PILL_HEIGHT,
              borderRadius: PILL_RADIUS,
              overflow: 'hidden',
              transform: [{ translateX: indicatorTranslateX }],
            }}
          />
        </GlassContainer>
        <View style={iosStyles.tabBar}>{tabs}</View>
        <View style={[iosStyles.topEdgeHighlight, isDarkMode && iosStyles.topEdgeHighlightDark]} pointerEvents="none" />
      </View>
    </View>
  );

  return <>{tabBar}</>;
};

// ====================================================================
// ==================== ANDROID MATERIAL TAB BAR ====================
// ====================================================================
const AndroidMaterialTabBar: React.FC<AdaptiveTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme, isDarkMode } = useTheme();
  const tabCount = state.routes.length;
  const screenWidth = Dimensions.get('window').width;
  const tabWidth = screenWidth / tabCount;
  const pillIndW = tabWidth * 0.55;
  const pillIndLeft = (tabWidth - pillIndW) / 2;

  const stateRef = useRef(state);
  stateRef.current = state;

  const indicatorTranslateX = useRef(
    new Animated.Value(state.index * tabWidth + pillIndLeft)
  ).current;

  useEffect(() => {
    Animated.spring(indicatorTranslateX, {
      toValue: state.index * tabWidth + pillIndLeft,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }, [state.index, tabWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const s = stateRef.current;
        const tw = screenWidth / s.routes.length;
        const pil = (tw - pillIndW) / 2;
        const raw = s.index * tw + pil + g.dx;
        const maxX = (s.routes.length - 1) * tw + pil;
        indicatorTranslateX.setValue(Math.max(pil, Math.min(raw, maxX)));
      },
      onPanResponderRelease: (_, g) => {
        const s = stateRef.current;
        const tw = screenWidth / s.routes.length;
        const pil = (tw - pillIndW) / 2;
        const raw = s.index * tw + pil + g.dx;
        const maxX = (s.routes.length - 1) * tw + pil;
        const clamped = Math.max(pil, Math.min(raw, maxX));
        const targetIdx = Math.round((clamped - pil) / tw);

        Animated.spring(indicatorTranslateX, {
          toValue: targetIdx * tw + pil,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
        }).start();

        const targetRoute = s.routes[targetIdx];
        if (targetIdx !== s.index && targetRoute) {
          navigation.navigate(targetRoute.name);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <View style={[androidStyles.container, { backgroundColor: theme.background }]}>
      {/* Sliding pill indicator at top */}
      <Animated.View
        style={[
          androidStyles.topPill,
          { width: pillIndW, transform: [{ translateX: indicatorTranslateX }] },
        ]}
      />
      <View
        {...panResponder.panHandlers}
        style={[androidStyles.tabBar, { backgroundColor: theme.background }]}
        pointerEvents="box-none"
      >
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;

          const { options } = descriptor;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={`${route.name} tab`}
              onPress={onPress}
              onLongPress={onLongPress}
              style={androidStyles.tabButton}
              activeOpacity={0.7}
            >
              <View style={androidStyles.rippleContainer}>
                <View style={androidStyles.iconContainer}>
                  {options.tabBarIcon?.({
                    focused: isFocused,
                    color: isDarkMode ? '#FFFFFF' : (isFocused ? '#000000' : '#666'),
                    size: 24,
                  })}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ==================== iOS STYLES ====================
const iosStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Wide soft ambient glow for depth
  shadowGlow: {
    position: 'absolute',
    height: 60,
    borderRadius: 32,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    bottom: 0,
  },
  glassPillContainer: {
    borderRadius: 30,
    overflow: 'hidden',
    // Hard key shadow for crisp edge definition
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
  },
  // Bright machined-rim highlight — top edge of the glass capsule
  topEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  topEdgeHighlightDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  blurLayer: {
    borderRadius: 30,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.70)',
    borderLeftColor: 'rgba(255, 255, 255, 0.35)',
    borderRightColor: 'rgba(255, 255, 255, 0.20)',
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  blurLayerDark: {
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
    borderLeftColor: 'rgba(255, 255, 255, 0.10)',
    borderRightColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomColor: 'rgba(0, 0, 0, 0.14)',
  },
  frostLayer: {
    // Slightly warmer frosted tint — matches iOS frosted glass
    backgroundColor: 'rgba(252, 252, 252, 0.18)',
    borderRadius: 30,
    position: 'relative',
  },
  frostLayerDark: {
    backgroundColor: 'rgba(20, 20, 20, 0.22)',
  },
  // Container that holds the absolute-positioned pill indicator
  indicatorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  // Glass pill — grey fill in light mode so it's visible against the white nav
  slidingPill: {
    position: 'absolute',
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(130, 130, 130, 0.14)',
    borderTopWidth: 1,
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.5,
    borderTopColor: 'rgba(180, 180, 180, 0.65)',
    borderLeftColor: 'rgba(160, 160, 160, 0.35)',
    borderRightColor: 'rgba(160, 160, 160, 0.18)',
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  slidingPillDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderTopColor: 'rgba(255, 255, 255, 0.28)',
    borderLeftColor: 'rgba(255, 255, 255, 0.14)',
    borderRightColor: 'rgba(255, 255, 255, 0.07)',
    borderBottomColor: 'rgba(0, 0, 0, 0.12)',
  },
  // Thin glint just inside the top rim — slightly lighter grey
  pillGlint: {
    position: 'absolute',
    top: 1.5,
    left: 10,
    right: 10,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(220, 220, 220, 0.70)',
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    zIndex: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    zIndex: 4,
  },
});

// ==================== ANDROID MATERIAL STYLES ====================
const androidStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  topPill: {
    position: 'absolute',
    top: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(130, 130, 130, 0.5)',
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 8,
    minHeight: 80,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});

export default AdaptiveTabBar;
