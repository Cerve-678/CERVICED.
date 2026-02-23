import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StatusBarBlur() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { height: insets.top }]}>
      <BlurView intensity={15} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'absolute',
    top: 0,
    zIndex: 99,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
