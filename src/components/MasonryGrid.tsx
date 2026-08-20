import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Animated, Dimensions, ScrollView, StyleSheet, RefreshControl } from 'react-native';
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
//
// Tuned by simulating the live feed: 0.15 leaves 2 of 48 cards level with a
// neighbour (vs 10 for plain shortest-column) while keeping the columns
// within ~82px of each other, i.e. under half a card of ragged tail.
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
    numColumns = 2,
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
  const screenWidth = Dimensions.get('window').width;
  const columnWidth = (screenWidth - contentPadding * 2 - columnGap * (numColumns - 1)) / numColumns;

  const columns = useMemo(() => {
    // Every column starts flush at the top — the grid's top edge is straight.
    // The stagger comes entirely from WHERE each card is placed, not from
    // offsetting the columns (see the placement rule below).
    const cols: { items: { item: T; index: number }[]; height: number }[] = Array.from(
      { length: numColumns },
      () => ({ items: [], height: 0 })
    );

    // Plain shortest-column packing is a height-EQUALIZING algorithm: its
    // whole job is to keep the columns level, so any card that gets ahead is
    // immediately corrected by the next one going to the other column. With
    // two columns that makes neighbours keep re-converging on the same
    // y-offsets — on the live feed, 18 of 24 cards ended up within 20px of a
    // card across the gap, with the first rows landing at pixel-identical
    // tops. Mathematically ideal, but it doesn't read as Pinterest.
    //
    // So placement optimises for a different thing: the card's bottom edge
    // should land far from the bottom edge of whatever is currently beside it
    // in the other columns. A short card dropped next to another short card
    // is what produces a visible shared seam, so we score every column and
    // take the best rather than blindly taking the shortest.
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
