import React, { useMemo } from 'react';
import { View, ScrollView, Dimensions, StyleSheet, RefreshControl } from 'react-native';
import { spacing } from '../constants/PlatformDimensions';

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
}: MasonryGridProps<T>) {
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding }]}
        showsVerticalScrollIndicator={false}
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
        {ListEmptyComponent}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding }]}
      showsVerticalScrollIndicator={false}
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
    </ScrollView>
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
