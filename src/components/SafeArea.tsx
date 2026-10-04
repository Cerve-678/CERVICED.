import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaView as NativeSafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * Extra top space on iPad so nothing sits under iPadOS's window controls (the
 * close / minimise / full-screen dots at the top-left of a windowed app).
 *
 * The system's safe area doesn't include them — UIKit only reserves that
 * corner for its own navigation bars — so every custom header in this app
 * (back buttons, titles, search bars) rode up underneath them. Tune it here;
 * every top inset in the app comes through this one number.
 */
export const IPAD_WINDOW_CONTROLS_INSET = 20;

const IS_IPAD = Platform.OS === 'ios' && Platform.isPad;

/**
 * Re-provides the safe-area insets with the window-controls space added to the
 * top edge on iPad, so every `useSafeAreaInsets()` caller below it drops its
 * content clear of them. (`SafeAreaView` below covers the native view, which
 * reads its insets from UIKit rather than from this context.) A no-op on
 * phones and Android.
 *
 * Mount it directly inside every `<SafeAreaProvider>`: a nested provider
 * replaces the insets with its own measurement, which won't include the extra.
 */
export function WindowControlsInsetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = useMemo(
    () => ({ ...insets, top: insets.top + IPAD_WINDOW_CONTROLS_INSET }),
    [insets],
  );
  if (!IS_IPAD) return <>{children}</>;
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

type SafeAreaViewProps = React.ComponentProps<typeof NativeSafeAreaView>;

/**
 * The library's `SafeAreaView`, plus `IPAD_WINDOW_CONTROLS_INSET` of extra top
 * padding on iPad when it pads the top edge. Use this one, not the library's
 * directly: the native view measures its own insets, so it can't see the space
 * `WindowControlsInsetProvider` adds. Identical to the native view everywhere
 * else, phones included.
 */
export function SafeAreaView(props: SafeAreaViewProps) {
  const { edges, style } = props;
  const padsTop = !edges || (Array.isArray(edges) && edges.includes('top'));
  if (!IS_IPAD || !padsTop) return <NativeSafeAreaView {...props} />;
  const flat = StyleSheet.flatten(style) ?? {};
  const baseTop = flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0;
  const paddingTop = (typeof baseTop === 'number' ? baseTop : 0) + IPAD_WINDOW_CONTROLS_INSET;
  // The native view adds the system inset on top of this padding.
  return <NativeSafeAreaView {...props} style={[style, { paddingTop }]} />;
}
