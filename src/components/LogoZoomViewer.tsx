// src/components/LogoZoomViewer.tsx
//
// A tap on a provider's logo circle: the same circle, zoomed in over the
// page, which stays visible behind a light blur. Nothing else on screen; a
// tap anywhere closes it. (FullImageViewer is the full-screen viewer for
// documents and photos; this is only for the logo.)

import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LogoCircle } from './FramedLogo';
import type { LogoFraming } from '../types/database';

interface Props {
  uri: string | null | undefined;
  framing?: LogoFraming | null | undefined;
  visible: boolean;
  onClose: () => void;
  /** Read out with the logo, e.g. the provider's name. */
  accessibilityName: string;
}

/** Widest the zoomed circle gets, so it stays a logo on a tablet. */
const MAX_SIZE = 360;

export function LogoZoomViewer({ uri, framing, visible, onClose, accessibilityName }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.78, MAX_SIZE);
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.6);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  if (!uri) return null;

  const close = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityName} logo. Tap to close`}
      >
        {/* Half blurred: the profile still reads behind it. */}
        <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, st.dim]} />
        <View style={st.center} pointerEvents="none">
          <Animated.View style={[st.shadow, { width: size, height: size, borderRadius: size / 2, opacity, transform: [{ scale }] }]}>
            <LogoCircle
              uri={uri}
              framing={framing}
              style={[st.circle, { width: size, height: size, borderRadius: size / 2 }]}
            />
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.12)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  circle: {
    borderWidth: 4,
    borderColor: 'rgba(255, 253, 251, 0.9)',
    backgroundColor: '#FFFFFF',
  },
});
