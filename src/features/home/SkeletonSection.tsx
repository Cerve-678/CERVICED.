import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface SkeletonSectionProps {
  cardWidth: number;
  cardHeight: number;
  borderRadius?: number;
  count?: number;
}

/** Shimmering row placeholder for Home discovery content. */
export function SkeletonSection({ cardWidth, cardHeight, borderRadius = 16, count = 4 }: SkeletonSectionProps) {
  const { palette: P } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 2 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View key={index} style={{ width: cardWidth, height: cardHeight, borderRadius, backgroundColor: P.surface, opacity, marginRight: 16 }} />
      ))}
    </View>
  );
}
