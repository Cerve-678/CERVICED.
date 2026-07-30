// CategoryTabPill.tsx
// Shared category-tab pill — frosted glass blur, a gradient sheen on the
// selected tab, and a spring scale-in on selection/press. This is the
// provider profile's original service-category tab treatment
// (was a local component there), now shared so Offers and Search use the
// exact same look instead of their own flatter, differently-animated tabs.
import React, { useCallback, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

export interface CategoryTabPillProps {
  category: string;
  isSelected: boolean;
  onPress: () => void;
  cardBg: string;
  blurIntensity: number;
  blurTint: 'light' | 'dark';
  borderColor: string;
  textColor: string;
}

const CategoryTabPill: React.FC<CategoryTabPillProps> = React.memo(
  ({ category, isSelected, onPress, cardBg, blurIntensity, blurTint, borderColor, textColor }) => {
    const pressAnimatedValue = useRef(new Animated.Value(1)).current;

    const handlePressIn = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }, [pressAnimatedValue]);

    const handlePressOut = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
      Haptics.selectionAsync();
      onPress();
    }, [pressAnimatedValue, onPress]);

    const animatedStyle = useMemo(
      () => ({ transform: [{ scale: pressAnimatedValue }] }),
      [pressAnimatedValue],
    );

    return (
      <TouchableOpacity onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
        <Animated.View style={animatedStyle}>
          <View style={[styles.tab, { borderColor }]}>
            <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.tabBlur, { backgroundColor: cardBg }]}>
              {isSelected && (
                <LinearGradient
                  colors={
                    (blurTint === 'dark'
                      ? ['rgba(255,255,255,0.08)', 'transparent']
                      : ['rgba(255,255,255,0.3)', 'transparent']) as [string, string]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.gradientOverlay}
                />
              )}
              <Text style={[styles.tabText, isSelected && styles.tabTextSelected, { color: textColor }]}>
                {category}
              </Text>
            </BlurView>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  },
);
CategoryTabPill.displayName = 'CategoryTabPill';

export default CategoryTabPill;

const styles = StyleSheet.create({
  tab: {
    borderRadius: 22,
    overflow: 'hidden',
    minWidth: 80,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabBlur: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    position: 'relative',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  tabTextSelected: {
    fontWeight: 'bold',
  },
});
