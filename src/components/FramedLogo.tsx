import React, { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { LogoCardSlot, LogoFraming } from '../types/database';
import { logoFrameLayout } from '../utils/logoFraming';

interface FramedLogoProps {
  uri: string;
  /** The provider's saved framing; null or missing = fill and centre. */
  framing?: LogoFraming | null | undefined;
  /** Which card's framing to use. Without one the logo fills and centres. */
  slot?: LogoCardSlot | undefined;
  /** Usually just a borderRadius matching the card. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A provider's logo filling its parent, placed the way the provider framed it
 * for that card. Fills the parent absolutely and clips to it, so the card
 * behind shows wherever the logo has been zoomed out past its edges.
 */
export const FramedLogo = memo(function FramedLogo({ uri, framing, slot, style }: FramedLogoProps) {
  const frame = slot ? framing?.[slot] : undefined;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  if (!frame || !framing) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.clip, style]}>
        <Image source={{ uri }} style={styles.fill} contentFit="cover" transition={0} />
      </View>
    );
  }

  const box = size ? logoFrameLayout(size.width, size.height, framing.imageRatio, frame) : null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.clip, style]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.width !== width || size.height !== height) setSize({ width, height });
      }}
    >
      {box && (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: box.width, height: box.height, left: box.left, top: box.top }}
          contentFit="cover"
          transition={0}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
