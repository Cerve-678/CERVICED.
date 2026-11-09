import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useFolderPhotos } from '../../stores/useCollectionsStore';
import type { ExploreCollection } from '../../types/collections';
import { CollectionFolder } from './CollectionFolder';

interface OpenCollectionHeaderProps {
  collection: ExploreCollection;
  onBack: () => void;
  onEdit: () => void;
}

/** Top of the Favourites grid while one collection is open. */
export function OpenCollectionHeader({ collection, onBack, onEdit }: OpenCollectionHeaderProps) {
  const { palette: P } = useTheme();
  const photos = useFolderPhotos(collection.itemIds);
  const count = collection.itemIds.length;
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={() => { tap(); onBack(); }}
          style={[styles.pill, { backgroundColor: P.surface }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to all Favourites"
        >
          <Ionicons name="chevron-back" size={16} color={P.text} />
          <Text style={[styles.pillText, { color: P.text }]}>All Favourites</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { tap(); onEdit(); }}
          style={[styles.pill, { backgroundColor: P.surface }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${collection.name}`}
        >
          <Text style={[styles.pillText, styles.editText, { color: P.text }]}>Edit</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.titleRow}>
        <CollectionFolder
          name={collection.name}
          count={count}
          color={collection.color}
          photos={photos}
          width={74}
          hideLabel
        />
        <View style={styles.titleText}>
          <Text style={[styles.title, { color: P.text }]} numberOfLines={2}>{collection.name}</Text>
          <Text style={[styles.count, { color: P.sub }]}>
            {count === 0 ? 'Empty' : count === 1 ? '1 look' : `${count} looks`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 12, gap: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 16,
  },
  pillText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14 },
  editText: { paddingLeft: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingTop: 4 },
  titleText: { flex: 1, minWidth: 0, paddingBottom: 6 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 26, lineHeight: 30 },
  count: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 14 },
});
