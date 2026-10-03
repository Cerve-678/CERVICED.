import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Slides its content up into place when it mounts. Use it for a sheet inside
 * a `<Modal animationType="fade">`, so the dim backdrop fades in while only
 * the sheet itself slides up. With `animationType="slide"` the backdrop
 * slides up along with the sheet.
 */
export function SlideUpOnMount({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const offset = useRef(new Animated.Value(60)).current;
  useEffect(() => {
    Animated.spring(offset, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260, mass: 0.9 }).start();
  }, [offset]);
  return <Animated.View style={[style, { transform: [{ translateY: offset }] }]}>{children}</Animated.View>;
}
