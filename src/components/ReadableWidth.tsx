import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { READABLE_MAX_WIDTH } from '../constants/readableWidth';

const ContentWidthContext = createContext<number | null>(null);
const BackdropContext = createContext<((color: string | null) => void) | null>(null);

/**
 * Wraps one screen in the centred column on wide windows; a no-op at phone
 * widths. Used as each stack navigator's `screenLayout`, so screens never
 * mount it themselves.
 *
 * The space either side is the app's page colour, unless the screen paints
 * its own page (a provider's profile in their chosen colours) and says so with
 * `useReadableBackdrop`, so the column doesn't read as a phone in a frame.
 */
export function ReadableWidth({ children }: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  const { palette } = useTheme();
  const [backdrop, setBackdrop] = useState<string | null>(null);
  if (width <= READABLE_MAX_WIDTH) return <>{children}</>;
  return (
    <View style={[styles.outer, { backgroundColor: backdrop ?? palette.bg }]}>
      <View style={styles.column}>
        <BackdropContext.Provider value={setBackdrop}>
          <ContentWidthContext.Provider value={READABLE_MAX_WIDTH}>{children}</ContentWidthContext.Provider>
        </BackdropContext.Provider>
      </View>
    </View>
  );
}

/**
 * Screens that use the whole window on purpose, because their layout already
 * grows with it: the provider calendar (more days across), Explore's masonry
 * and Search's results grid (more columns). `MainTabs` is the root stack's
 * holder for the tab bar, so it must never be wrapped.
 */
const FULL_WIDTH_SCREENS = new Set<string>([
  'MainTabs',
  'ProviderHomeMain',
  'ExploreMain',
  'Search',
]);

/** Every stack navigator's `screenLayout`: the centred column for every screen
 *  except the full-width ones above. */
export function readableScreenLayout({
  children,
  route,
}: {
  children: React.ReactElement;
  route: { name: string };
}): React.ReactElement {
  if (FULL_WIDTH_SCREENS.has(route.name)) return children;
  return <ReadableWidth>{children}</ReadableWidth>;
}

/**
 * `useWindowDimensions()`, but with the width a screen actually has to draw
 * in. Inside a `ReadableWidth` column that's the column, not the window, so
 * anything sized off the width (grids, carousels, hero heights) fits the
 * column instead of spilling out of it.
 */
export function useContentWidth(): { width: number; height: number; scale: number; fontScale: number } {
  const dims = useWindowDimensions();
  const cap = useContext(ContentWidthContext);
  return useMemo(
    () => (cap === null ? dims : { ...dims, width: Math.min(dims.width, cap) }),
    [dims, cap],
  );
}

/**
 * Colour the space either side of this screen's column to match its own page
 * colour. Does nothing at phone widths, where there is no space either side.
 */
export function useReadableBackdrop(color: string | null | undefined): void {
  const setBackdrop = useContext(BackdropContext);
  useEffect(() => {
    if (!setBackdrop) return;
    setBackdrop(color ?? null);
    return () => setBackdrop(null);
  }, [setBackdrop, color]);
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: READABLE_MAX_WIDTH, overflow: 'hidden' },
});
