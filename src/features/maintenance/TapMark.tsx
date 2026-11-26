// src/features/maintenance/TapMark.tsx
//
// A fingertip that taps: a soft dot that presses down while a ring spreads out
// from it. Used only by the "How this works" walkthrough, which draws the real
// Maintenance cards and marks the button it is pretending to press. It sits
// over its parent and never takes a touch.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

const SIZE = 34;

export function TapMark({ colour }: { colour: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [v]);
  const dotScale = v.interpolate({ inputRange: [0, 0.25, 0.5, 1], outputRange: [1.25, 1.25, 0.85, 1] });
  const dotOpacity = v.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.55, 0.55, 0.4] });
  const ringScale = v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.6, 0.6, 2] });
  const ringOpacity = v.interpolate({ inputRange: [0, 0.45, 0.5, 1], outputRange: [0, 0, 0.7, 0] });
  return (
    <Animated.View pointerEvents="none" style={styles.centre}>
      <Animated.View style={[styles.ring, { borderColor: colour, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={[styles.dot, { backgroundColor: colour, opacity: dotOpacity, transform: [{ scale: dotScale }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
});
