import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReAnimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface FullImageViewerProps {
  /** One image (a logo) or several pages (a policy), in reading order. */
  uris: readonly string[];
  visible: boolean;
  onClose: () => void;
  /** What the image is, for screen readers: "Policy document", "Logo". */
  label: string;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

/**
 * Full-screen view of an image, or of every page of a provider's detailed
 * policy one under another.
 *
 * Each page is shown at the screen's full width and as tall as the photo
 * really is, inside a scroll view, so a long document reads top to bottom
 * instead of shrinking to fit one screen. Pinch or double-tap a page to zoom
 * into it, on iOS and Android alike; while it's zoomed, dragging moves around
 * it, and pinching back out (or double-tapping) returns to scrolling. Used by
 * the provider profile and the client's booking detail, so both open the same
 * document the same way.
 */
export function FullImageViewer({ uris, visible, onClose, label }: FullImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Pages currently zoomed. Scrolling stops while any is, so a drag moves
  // around the zoomed page instead of scrolling past it.
  const zoomedPages = useRef(new Set<number>());
  const [anyZoomed, setAnyZoomed] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Opening again starts unzoomed.
  useEffect(() => {
    if (!visible) return;
    zoomedPages.current.clear();
    setAnyZoomed(false);
    setResetKey(k => k + 1);
  }, [visible]);

  const onZoomChange = useCallback((page: number, zoomed: boolean) => {
    if (zoomed) zoomedPages.current.add(page);
    else zoomedPages.current.delete(page);
    setAnyZoomed(zoomedPages.current.size > 0);
  }, []);

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  const pages = uris.filter(Boolean);
  const multiple = pages.length > 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is outside the app's root gesture view, so it needs its own. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { minHeight: height, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 56 },
          ]}
          scrollEnabled={!anyZoomed}
          showsVerticalScrollIndicator
          indicatorStyle="white"
        >
          {pages.map((uri, index) => (
            <View key={`${resetKey}:${uri}`}>
              {multiple && (
                <Text style={styles.pageLabel}>Page {index + 1} of {pages.length}</Text>
              )}
              <ZoomablePage
                uri={uri}
                width={width}
                fallbackHeight={height * 0.7}
                label={multiple ? `${label}, page ${index + 1} of ${pages.length}` : label}
                onZoomChange={zoomed => onZoomChange(index, zoomed)}
              />
            </View>
          ))}
        </ScrollView>

        <View pointerEvents="none" style={[styles.hint, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.hintText}>
            {anyZoomed ? 'Pinch out or double-tap to go back' : 'Pinch or double-tap to zoom'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={close}
          style={[styles.close, { top: insets.top + 12 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label.toLowerCase()}`}
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

interface ZoomablePageProps {
  uri: string;
  width: number;
  /** Used until the image has loaded and its real shape is known. */
  fallbackHeight: number;
  label: string;
  onZoomChange: (zoomed: boolean) => void;
}

function ZoomablePage({ uri, width, fallbackHeight, label, onZoomChange }: ZoomablePageProps) {
  // Height over width, from the image itself once it loads.
  const [ratio, setRatio] = useState<number | null>(null);
  const pageHeight = ratio ? width * ratio : fallbackHeight;
  const [zoomed, setZoomed] = useState(false);

  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const report = useCallback((next: boolean) => {
    setZoomed(next);
    onZoomChange(next);
  }, [onZoomChange]);

  // Offsets are from the page's centre, the point a scale transform grows from.
  const clampX = (value: number, s: number) => {
    'worklet';
    const max = (width * s - width) / 2;
    return Math.min(max, Math.max(-max, value));
  };
  const clampY = (value: number, s: number) => {
    'worklet';
    const max = (pageHeight * s - pageHeight) / 2;
    return Math.min(max, Math.max(-max, value));
  };
  const settle = () => {
    'worklet';
    const isZoomed = scale.value > 1.01;
    if (!isZoomed) {
      scale.value = withTiming(1);
      x.value = withTiming(0);
      y.value = withTiming(0);
    }
    runOnJS(report)(isZoomed);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      const s = Math.min(MAX_ZOOM, Math.max(1, startScale.value * e.scale));
      // Keep the point between the fingers where it is.
      const fx = e.focalX - width / 2;
      const fy = e.focalY - pageHeight / 2;
      const grow = s / startScale.value;
      scale.value = s;
      x.value = clampX(fx - (fx - startX.value) * grow, s);
      y.value = clampY(fy - (fy - startY.value) * grow, s);
    })
    .onEnd(() => {
      settle();
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      x.value = clampX(startX.value + e.translationX, scale.value);
      y.value = clampY(startY.value + e.translationY, scale.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(e => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
        runOnJS(report)(false);
        return;
      }
      const fx = e.x - width / 2;
      const fy = e.y - pageHeight / 2;
      scale.value = withTiming(DOUBLE_TAP_ZOOM);
      x.value = withTiming(clampX(-fx * (DOUBLE_TAP_ZOOM - 1), DOUBLE_TAP_ZOOM));
      y.value = withTiming(clampY(-fy * (DOUBLE_TAP_ZOOM - 1), DOUBLE_TAP_ZOOM));
      runOnJS(report)(true);
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* Not transformed itself, so finger positions are measured on the page. */}
      <View style={{ width, height: pageHeight, overflow: 'hidden' }} collapsable={false}>
        <ReAnimated.View style={[{ width, height: pageHeight }, imageStyle]}>
          <Image
            source={{ uri }}
            style={{ width, height: pageHeight }}
            contentFit="contain"
            transition={0}
            // Keep the full-resolution pixels, so zooming in stays sharp.
            allowDownscaling={false}
            onLoad={event => {
              const { width: w, height: h } = event.source;
              if (w > 0 && h > 0) setRatio(h / w);
            }}
            accessibilityLabel={label}
          />
        </ReAnimated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  content: { justifyContent: 'center', gap: 20 },
  pageLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hintText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  close: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
