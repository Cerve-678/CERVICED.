import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReAnimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { LogoCardFrame, LogoCardSlot } from '../../types/database';
import {
  clampLogoFrame,
  DEFAULT_LOGO_FRAME,
  LOGO_CARD_SIZES,
  logoFrameLayout,
  minLogoZoom,
} from '../../utils/logoFraming';

interface LogoCardFramerProps {
  /** Which card is being framed; null = closed. */
  slot: LogoCardSlot | null;
  uri: string | null;
  /** The logo image's width ÷ height. */
  imageRatio: number;
  /** The card's current framing, to start from. */
  initial: LogoCardFrame | undefined;
  onDone: (slot: LogoCardSlot, frame: LogoCardFrame) => void;
  onCancel: () => void;
  palette: { bg: string; card: string; text: string; sub: string; accent: string; onAccent: string };
}

const TITLES: Record<LogoCardSlot, string> = {
  small: 'Small Home card',
  large: 'Large Home card',
};

/**
 * Frames the logo for one Home card, in that card's exact shape: pinch to
 * zoom (out until the whole logo fits, or in), drag to move. Saves only a
 * zoom and an offset; the logo image itself is never re-cut, so each card
 * can frame it differently.
 */
export function LogoCardFramer({ slot, uri, imageRatio, initial, onDone, onCancel, palette }: LogoCardFramerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const card = LOGO_CARD_SIZES[slot ?? 'large'];
  const cardRatio = card.width / card.height;
  // Shown bigger than on Home so it's easy to work with, but the same shape.
  const frameW = Math.min(screenWidth - 48, 340);
  const frameH = frameW / cardRatio;

  const zoom = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Start from the card's saved framing each time the framer opens.
  useEffect(() => {
    if (!slot) return;
    const from = clampLogoFrame(initial ?? DEFAULT_LOGO_FRAME, cardRatio, imageRatio);
    zoom.value = from.zoom;
    x.value = from.x;
    y.value = from.y;
  }, [slot, initial, cardRatio, imageRatio, zoom, x, y]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoom.value;
    })
    .onUpdate(e => {
      const next = clampLogoFrame({ zoom: startZoom.value * e.scale, x: x.value, y: y.value }, cardRatio, imageRatio);
      zoom.value = next.zoom;
      x.value = next.x;
      y.value = next.y;
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      const next = clampLogoFrame(
        { zoom: zoom.value, x: startX.value + e.translationX / frameW, y: startY.value + e.translationY / frameH },
        cardRatio,
        imageRatio,
      );
      x.value = next.x;
      y.value = next.y;
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const imageStyle = useAnimatedStyle(() => {
    const box = logoFrameLayout(frameW, frameH, imageRatio, { zoom: zoom.value, x: x.value, y: y.value });
    return { width: box.width, height: box.height, left: box.left, top: box.top };
  });

  const animateTo = (frame: LogoCardFrame) => {
    Haptics.selectionAsync().catch(() => {});
    zoom.value = withTiming(frame.zoom);
    x.value = withTiming(frame.x);
    y.value = withTiming(frame.y);
  };

  if (!slot || !uri) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      {/* Gestures inside a Modal need their own root on iOS. */}
      <GestureHandlerRootView style={[styles.backdrop, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.headerAction, { color: palette.sub }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: palette.text }]}>{TITLES[slot]}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={[styles.hint, { color: palette.sub }]}>Pinch to zoom, drag to move.</Text>

        <GestureDetector gesture={gesture}>
          <View
            style={[
              styles.frame,
              { width: frameW, height: frameH, borderRadius: card.radius * (frameW / card.width), backgroundColor: palette.card },
            ]}
            accessibilityLabel={`Your logo on the ${TITLES[slot].toLowerCase()}. Pinch to zoom, drag to move.`}
          >
            <ReAnimated.Image source={{ uri }} style={[styles.image, imageStyle]} resizeMode="cover" fadeDuration={0} />
          </View>
        </GestureDetector>

        <View style={styles.presets}>
          <TouchableOpacity
            onPress={() => animateTo({ zoom: minLogoZoom(cardRatio, imageRatio), x: 0, y: 0 })}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={[styles.preset, { backgroundColor: palette.card }]}
          >
            <Text style={[styles.presetText, { color: palette.text }]}>Show whole logo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => animateTo(DEFAULT_LOGO_FRAME)}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={[styles.preset, { backgroundColor: palette.card }]}
          >
            <Text style={[styles.presetText, { color: palette.text }]}>Fill card</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onDone(slot, clampLogoFrame({ zoom: zoom.value, x: x.value, y: y.value }, cardRatio, imageRatio));
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.done, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.doneText, { color: palette.onAccent }]}>Done</Text>
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  headerAction: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700' },
  headerSpacer: { width: 52 },
  hint: { fontSize: 12, marginBottom: 14, textAlign: 'center' },
  frame: { overflow: 'hidden' },
  image: { position: 'absolute' },
  presets: { flexDirection: 'row', gap: 10, marginTop: 18 },
  preset: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  presetText: { fontSize: 13, fontWeight: '700' },
  done: {
    marginTop: 22,
    paddingHorizontal: 34,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 170,
    alignItems: 'center',
  },
  doneText: { fontSize: 15, fontWeight: '700' },
});
