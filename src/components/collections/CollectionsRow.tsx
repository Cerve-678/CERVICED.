import React, { memo, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useFolderPhotos } from '../../stores/useCollectionsStore';
import type { ExploreCollection } from '../../types/collections';
import { CollectionFolder, type FolderPaperRect } from './CollectionFolder';

const FOLDER_WIDTH = 138;

interface CollectionsRowProps {
  collections: ExploreCollection[];
  /** Gets where the folder's looks were, newest first, for the open animation. */
  onOpen: (collection: ExploreCollection, papers: FolderPaperRect[]) => void;
  onEdit: (collection: ExploreCollection) => void;
  onNew: () => void;
  /** Side padding, to line the first folder up with the grid below. */
  inset: number;
}

/** The swipeable row of jelly folders at the top of Explore → Favourites. */
export function CollectionsRow({ collections, onOpen, onEdit, onNew, inset }: CollectionsRowProps) {
  const { palette: P } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingHorizontal: inset }]}>
        <Text style={[styles.title, { color: P.text }]}>Collections</Text>
        <TouchableOpacity
          onPress={() => { tap(); onNew(); }}
          style={[styles.newPill, { backgroundColor: P.surface }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="New collection"
        >
          <Ionicons name="add" size={16} color={P.text} />
          <Text style={[styles.newText, { color: P.text }]}>New</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.rail, { paddingHorizontal: inset }]}
      >
        {collections.map(collection => (
          <RowFolder key={collection.id} collection={collection} onOpen={onOpen} onEdit={onEdit} />
        ))}
        {collections.length === 0 && (
          <TouchableOpacity
            onPress={() => { tap(); onNew(); }}
            style={[styles.ghost, { borderColor: P.border, width: FOLDER_WIDTH }]}
            activeOpacity={0.7}
          >
            <Ionicons name="folder-open-outline" size={26} color={P.sub} />
            <Text style={[styles.ghostTitle, { color: P.text }]}>Start a collection</Text>
            <Text style={[styles.ghostSub, { color: P.sub }]}>Sort your looks into folders</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/** One folder in the row; re-draws only when its own collection or photos change. */
const RowFolder = memo(function RowFolder({
  collection,
  onOpen,
  onEdit,
}: {
  collection: ExploreCollection;
  onOpen: (collection: ExploreCollection, papers: FolderPaperRect[]) => void;
  onEdit: (collection: ExploreCollection) => void;
}) {
  const photos = useFolderPhotos(collection.itemIds);
  const handlePress = useCallback((papers: FolderPaperRect[]) => { tap(); onOpen(collection, papers); }, [collection, onOpen]);
  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onEdit(collection);
  }, [collection, onEdit]);
  return (
    <CollectionFolder
      name={collection.name}
      count={collection.itemIds.length}
      color={collection.color}
      photos={photos}
      width={FOLDER_WIDTH}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  newPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 9,
    paddingRight: 12,
    height: 30,
    borderRadius: 15,
  },
  newText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14 },
  // Top padding leaves room for photos sticking out and lifting on press;
  // bottom padding for the folder's shadow.
  rail: { gap: 14, paddingTop: 12, paddingBottom: 14 },
  ghost: {
    height: 114,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  ghostTitle: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14 },
  ghostSub: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 12, textAlign: 'center' },
});
