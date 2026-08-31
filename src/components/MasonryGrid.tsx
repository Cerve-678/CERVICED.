import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Animated, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, Platform } from 'react-native';
import { spacing } from '../constants/PlatformDimensions';
import { useTheme } from '../contexts/ThemeContext';

// How far apart two cards' bottom edges have to be before they stop reading
// as "level", expressed as a fraction of column width. Separation beyond this
// earns no extra score, so the packer stops chasing distance it doesn't need
// and spends the freedom on balance instead.
const SEAM_TARGET_RATIO = 0.25;

// How hard the packer is pulled back toward equal-length columns. Both this
// and the separation term are normalised against SEAM_TARGET_RATIO before
// being combined, so the two are on the same scale and this number actually
// means something — an earlier version compared a capped separation against
// an uncapped overshoot, which made the balance term dominate completely and
// silently degraded the whole thing back to plain shortest-column packing.
const BALANCE_WEIGHT = 0.15;

// Exposed so a filter/category change can explicitly reset scroll to the
// top. MasonryGrid renders one persistent ScrollView per screen (not one per
// filter) — swapping the `data` prop when a filter changes does not reset
// native scroll position, since that's a property of the mounted ScrollView,
// not of what data it happens to be displaying. Without this, switching
// filters leaves the grid at whatever pixel offset the previous filter was
// scrolled to.
export interface MasonryGridHandle {
  scrollToTop: (animated?: boolean) => void;
}

/**
 * How many masonry columns a window of this width should show.
 *
 * A phone gets two. Anything wider fills the space it actually has rather than
 * stretching two columns across a tablet — on an iPad, two columns means two
 * enormous cards per row and almost nothing visible at once, which loses the
 * browse-a-lot-at-a-glance feel the grid exists for. More columns also gives
 * the shortest-column packing more places to put each card, so the stagger
 * reads as more varied on a big screen rather than more regular.
 *
 * Breakpoints are window width in dp, so they respond to split-screen and
 * rotation, not just to which device it is.
 */
export function masonryColumnsForWidth(width: number): number {
  if (width >= 1200) return 5; // iPad Pro landscape
  if (width >= 900) return 4;  // iPad landscape
  if (width >= 600) return 3;  // iPad portrait, phone landscape
  return 2;                    // phones
}

interface MasonryGridProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemHeight: (item: T, columnWidth: number) => number;
  keyExtractor: (item: T) => string;
  numColumns?: number;
  columnGap?: number;
  contentPadding?: number;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  // Typed off Animated.ScrollView itself so callers can pass either a plain
  // callback or an Animated.event(...) handle (e.g. useNativeDriver: true,
  // which returns a non-callable AnimatedEvent object — see
  // src/utils/exploreTabBarScroll.ts). A plain RN ScrollView would call this
  // prop as a function and crash on that object.
  onScroll?: React.ComponentProps<typeof Animated.ScrollView>['onScroll'];
  onScrollEndDrag?: React.ComponentProps<typeof Animated.ScrollView>['onScrollEndDrag'];
  onMomentumScrollEnd?: React.ComponentProps<typeof Animated.ScrollView>['onMomentumScrollEnd'];
}

function MasonryGridInner<T>(
  {
    data,
    renderItem,
    getItemHeight,
    keyExtractor,
    numColumns: numColumnsProp,
    columnGap = spacing.sm,
    contentPadding = spacing.lg,
    ListHeaderComponent,
    ListEmptyComponent,
    refreshing,
    onRefresh,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
  }: MasonryGridProps<T>,
  ref: React.ForwardedRef<MasonryGridHandle>
) {
  const { theme } = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useImperativeHandle(ref, () => ({
    scrollToTop: (animated = false) => {
      scrollRef.current?.scrollTo({ y: 0, animated });
    },
  }), []);
  const { width: screenWidth } = useWindowDimensions();
  // Defaults to the width-derived count; an explicit prop still overrides it.
  const numColumns = numColumnsProp ?? masonryColumnsForWidth(screenWidth);
  const columnWidth = (screenWidth - contentPadding * 2 - columnGap * (numColumns - 1)) / numColumns;

  const columns = useMemo(() => {
    // Every column starts flush at the top — the grid's top edge is straight.
    // The stagger comes entirely from WHERE each card is placed, not from
    // offsetting the columns (see the placement rule below).
    const cols: { items: { item: T; index: number }[]; height: number }[] = Array.from(
      { length: numColumns },
      () => ({ items: [], height: 0 })
    );

    // Plain shortest-column packing keeps dropping a card next to whatever
    // card is already beside the shortest column — since short cards keep
    // that column "winning", a run of short cards in the data clusters into
    // a run of short cards sitting beside each other on screen (short
    // surrounded by short), which reads as gridlike rather than Pinterest.
    //
    // So placement instead optimises for the card's bottom edge landing far
    // from the bottom edge of whatever is currently beside it in the other
    // columns — a short card next to another short card is exactly what
    // produces a visible shared seam, so every column is scored and the best
    // one is taken rather than blindly the shortest.
    //
    // Balance is kept as a weighted term instead of an absolute rule, so the
    // columns still finish at comparable lengths (no long ragged tail) while
    // being free to disagree card-by-card.
    const seamTarget = columnWidth * SEAM_TARGET_RATIO;

    data.forEach((item, index) => {
      const itemHeight = getItemHeight(item, columnWidth);
      const shortest = Math.min(...cols.map(c => c.height));

      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < numColumns; i++) {
        const col = cols[i];
        if (!col) continue;

        // Where this card's bottom edge would land if placed here.
        const candidateBottom = col.height + itemHeight;

        // Distance from that edge to the current bottom edge of every other
        // column — i.e. to the cards it would physically sit beside. The
        // nearest one is what the eye actually reads as a shared seam.
        let nearestSeam = Infinity;
        for (let j = 0; j < numColumns; j++) {
          if (j === i) continue;
          const other = cols[j];
          if (!other) continue;
          nearestSeam = Math.min(nearestSeam, Math.abs(candidateBottom - other.height));
        }
        if (!Number.isFinite(nearestSeam)) nearestSeam = seamTarget;

        // Both terms normalised against the same seam target so they're
        // directly comparable (see BALANCE_WEIGHT).
        const separation = Math.min(nearestSeam, seamTarget) / seamTarget;
        const overshoot = Math.max(0, candidateBottom - shortest) / seamTarget;

        const score = separation - overshoot * BALANCE_WEIGHT;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      const col = cols[bestIdx];
      if (col) {
        col.items.push({ item, index });
        col.height += itemHeight + columnGap;
      }
    });

    return cols;
  }, [data, numColumns, columnWidth, columnGap, getItemHeight]);

  if (data.length === 0 && ListEmptyComponent) {
    return (
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing || false}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          ) : undefined
        }
      >
        {ListHeaderComponent}
        {ListEmptyComponent}
      </Animated.ScrollView>
    );
  }

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding }]}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      scrollEventThrottle={16}
      // The grid is one ScrollView holding every card — there is no
      // virtualization to fall back on — so on Android, where the photo feed
      // is heaviest, offscreen cards are detached from the view hierarchy
      // while scrolling. Android-only: it is a no-op to slightly harmful on
      // iOS, which is why the rest of the app gates it the same way.
      removeClippedSubviews={Platform.OS === 'android'}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing || false}
            onRefresh={onRefresh}
            tintColor="#a342c3ff"
            colors={['#a342c3ff']}
          />
        ) : undefined
      }
    >
      {ListHeaderComponent}
      <View style={[styles.row, { gap: columnGap }]}>
        {columns.map((col, colIndex) => (
          <View key={colIndex} style={[styles.column, { width: columnWidth }]}>
            {col.items.map(({ item, index }) => (
              <View key={keyExtractor(item)} style={{ marginBottom: columnGap }}>
                {renderItem(item, index)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </Animated.ScrollView>
  );
}

// forwardRef + a generic function component don't type-check cleanly
// together (forwardRef's own signature isn't generic-aware) — cast through
// the explicit function type we actually want callers to see, same pattern
// as the pre-existing React.memo cast just below it.
type MasonryGridComponent = <T>(
  props: MasonryGridProps<T> & { ref?: React.ForwardedRef<MasonryGridHandle> }
) => React.ReactElement | null;

export const MasonryGrid = React.memo(forwardRef(MasonryGridInner)) as unknown as MasonryGridComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flexDirection: 'column',
  },
});
