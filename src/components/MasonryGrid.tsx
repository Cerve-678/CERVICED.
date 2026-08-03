import React, { useMemo } from 'react';
import { View, Animated, Dimensions, StyleSheet, RefreshControl } from 'react-native';
import { spacing } from '../constants/PlatformDimensions';
import { useTheme } from '../contexts/ThemeContext';

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

function MasonryGridInner<T>({
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
}: MasonryGridProps<T>) {
  const { theme } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const columnWidth = (screenWidth - contentPadding * 2 - columnGap * (numColumns - 1)) / numColumns;

  const columns = useMemo(() => {
    const cols: { items: { item: T; index: number }[]; height: number }[] = Array.from(
      { length: numColumns },
      () => ({ items: [], height: 0 })
    );

    data.forEach((item, index) => {
      // Find the shortest column
      let shortestIdx = 0;
      for (let i = 1; i < numColumns; i++) {
        if ((cols[i]?.height ?? 0) < (cols[shortestIdx]?.height ?? 0)) {
          shortestIdx = i;
        }
      }
      const col = cols[shortestIdx];
      if (col) {
        col.items.push({ item, index });
        col.height += getItemHeight(item, columnWidth) + columnGap;
      }
    });

    return cols;
  }, [data, numColumns, columnWidth, columnGap, getItemHeight]);

  if (data.length === 0 && ListEmptyComponent) {
    return (
      <Animated.ScrollView
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

export const MasonryGrid = React.memo(MasonryGridInner) as typeof MasonryGridInner;

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
