/**
 * The website's BlurView. metro.config.js points every `expo-blur` import at
 * this file in the web build only; the phone app still gets expo-blur itself.
 *
 * Why: on a phone, a BlurView's own `backgroundColor` shows (a selected
 * category pill is the provider's accent with white text), with the frosted
 * material laid over it. expo-blur's web version paints its tint colour in
 * place of that background instead, so the same pill came out white on white.
 * Here, as on the phone, the view's own colour is drawn first, then the tint
 * at the same strength expo-blur uses, then the children; the frosted blur of
 * whatever is behind stays. Without a background colour this is expo-blur's
 * web BlurView exactly.
 */
import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewInstance } from 'react-native';
import { BlurView as ExpoBlurView, type BlurViewProps } from 'expo-blur';
// expo-blur's own web tint colours, so the veil matches its web BlurView.
import getBackgroundColor from 'expo-blur/build/getBackgroundColor';

/** expo-blur's own web blur strength for an intensity (0–100). */
function webBackdropFilter(intensity: number): string {
  return `saturate(180%) blur(${Math.min(intensity, 100) * 0.2}px)`;
}

export const BlurView = forwardRef<ViewInstance, BlurViewProps>(function BlurView(props, ref) {
  const ownBackground = StyleSheet.flatten(props.style)?.backgroundColor;
  if (ownBackground == null) return <ExpoBlurView ref={ref as never} {...props} />;

  const { intensity = 50, tint = 'default', style, children, ...rest } = props;
  const filter = webBackdropFilter(intensity);
  // backdropFilter is a web-only style react-native-web passes straight to CSS.
  const blur = { backdropFilter: filter, WebkitBackdropFilter: filter } as object;
  const veil: string | undefined = getBackgroundColor(Math.min(intensity, 100), tint);
  return (
    <View ref={ref} {...rest} style={[style, blur]}>
      {veil ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veil }]} /> : null}
      {children}
    </View>
  );
});
