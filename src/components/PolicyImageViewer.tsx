import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PolicyImageViewerProps {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Full-screen view of a provider's detailed policy image.
 *
 * Shown at the screen's full width and as tall as the photo really is, inside
 * a scroll view, so a long policy document reads top to bottom instead of
 * shrinking to fit one screen. A short one sits centred. Pinch zooms on iOS.
 * Used by the provider profile and the client's booking detail, so both open
 * the same document the same way.
 */
export function PolicyImageViewer({ uri, visible, onClose }: PolicyImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Height over width, from the image itself once it loads.
  const [ratio, setRatio] = useState<{ uri: string; value: number } | null>(null);
  const knownRatio = ratio && ratio.uri === uri ? ratio.value : null;
  const imageHeight = knownRatio ? width * knownRatio : height * 0.7;

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { minHeight: height, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 },
          ]}
          maximumZoomScale={3}
          minimumZoomScale={1}
          bouncesZoom
          showsVerticalScrollIndicator
          indicatorStyle="white"
        >
          {uri && (
            <Image
              source={{ uri }}
              style={{ width, height: imageHeight }}
              contentFit="contain"
              transition={0}
              // expo-image normally decodes at the view's size, which is what
              // pinch-zoom then enlarges: small print went soft at 2-3x. One
              // full-resolution image on its own screen is worth the memory.
              allowDownscaling={false}
              onLoad={event => {
                const { width: w, height: h } = event.source;
                if (w > 0 && h > 0) setRatio({ uri, value: h / w });
              }}
              accessibilityLabel="Policy document"
            />
          )}
        </ScrollView>
        <TouchableOpacity
          onPress={close}
          style={[styles.close, { top: insets.top + 12 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Close policy document"
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  content: { justifyContent: 'center' },
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
