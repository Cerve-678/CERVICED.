import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useCollectionsStore, useFolderPhotos, type CollectionHost } from '../../stores/useCollectionsStore';
import { useBookmarkStore } from '../../stores/useBookmarkStore';
import { COLLECTION_COLORS, type CollectionColor, type ExploreCollection } from '../../types/collections';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { CollectionFolder } from './CollectionFolder';
import { CollectionForm } from './CollectionForm';
import { CollectionSheetFrame } from './CollectionSheetFrame';

interface AddToCollectionSheetProps {
  host: CollectionHost;
}

/**
 * Pick which folders a look goes in. Tapping a folder adds the look or takes
 * it out again. A look has to be in Favourites to go in a folder (the
 * database refuses otherwise), so one that isn't yet is hearted first.
 */
export function AddToCollectionSheet({ host }: AddToCollectionSheetProps) {
  const { palette: P } = useTheme();
  const sheet = useCollectionsStore(s => s.sheet);
  const collections = useCollectionsStore(s => s.collections);
  const closeSheet = useCollectionsStore(s => s.closeSheet);
  const toggleItem = useCollectionsStore(s => s.toggleItem);
  const createCollection = useCollectionsStore(s => s.create);

  const visible = sheet?.host === host;
  const itemId = visible ? sheet.itemId : null;

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<CollectionColor>('pink');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fresh state each time the sheet opens. With no folders yet, go straight
  // to making one.
  useEffect(() => {
    if (!visible) return;
    const count = useCollectionsStore.getState().collections.length;
    setCreating(count === 0);
    setName('');
    setColor(COLLECTION_COLORS[count % COLLECTION_COLORS.length] ?? 'pink');
    setError(null);
    setBusyId(null);
  }, [visible, itemId]);

  const ensureSaved = useCallback(async (id: string) => {
    const bookmarks = useBookmarkStore.getState();
    if (bookmarks.isPortfolioSaved(id)) return;
    await bookmarks.savePortfolioItem(id);
    if (!useBookmarkStore.getState().isPortfolioSaved(id)) {
      throw new Error('Could not save this look to Favourites');
    }
  }, []);

  const handleToggle = useCallback(async (collectionId: string) => {
    if (!itemId || busyId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusyId(collectionId);
    setError(null);
    try {
      await ensureSaved(itemId);
      await toggleItem(collectionId, itemId);
    } catch (e) {
      setError(toUserMessageAllowingDbGuard(e, "Couldn't update that collection. Try again.", 'collections.toggle'));
    } finally {
      setBusyId(null);
    }
  }, [busyId, ensureSaved, itemId, toggleItem]);

  const handleCreate = useCallback(async () => {
    if (!itemId || busyId) return;
    if (!name.trim()) {
      setError('Give your collection a name.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusyId('new');
    setError(null);
    let made: { id: string; name: string } | null = null;
    try {
      await ensureSaved(itemId);
      made = await createCollection(name, color);
      await toggleItem(made.id, itemId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeSheet();
    } catch (e) {
      if (made) {
        // The folder exists; only adding the look failed. Show the folders
        // so a retry taps the new one rather than making a second.
        setCreating(false);
        setError(toUserMessageAllowingDbGuard(
          e,
          `Made ${made.name}, but couldn't add this look. Tap it to try again.`,
          'collections.createAdd',
        ));
      } else {
        setError(toUserMessageAllowingDbGuard(e, "Couldn't make that collection. Try again.", 'collections.create'));
      }
    } finally {
      setBusyId(null);
    }
  }, [busyId, closeSheet, color, createCollection, ensureSaved, itemId, name, toggleItem]);

  return (
    <CollectionSheetFrame
      visible={visible}
      title="Add to a collection"
      subtitle={creating ? 'Make a folder for this look.' : 'Tap a folder to put this look in it, or tap again to take it out.'}
      onClose={closeSheet}
    >
      {!creating && (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {collections.map(collection => {
            const inside = itemId ? collection.itemIds.includes(itemId) : false;
            return (
              <Pressable
                key={collection.id}
                onPress={() => handleToggle(collection.id)}
                style={[styles.row, { backgroundColor: P.card }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: inside, busy: busyId === collection.id }}
                accessibilityLabel={collection.name}
              >
                <SheetFolder collection={collection} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: P.text }]} numberOfLines={1}>{collection.name}</Text>
                  <Text style={[styles.rowCount, { color: P.sub }]}>
                    {collection.itemIds.length === 1 ? '1 look' : `${collection.itemIds.length} looks`}
                  </Text>
                </View>
                {busyId === collection.id ? (
                  <ActivityIndicator color={P.accent} />
                ) : (
                  <View
                    style={[
                      styles.check,
                      inside ? { backgroundColor: P.accent, borderColor: P.accent } : { borderColor: P.border },
                    ]}
                  >
                    {inside && <Ionicons name="checkmark" size={16} color={P.onAccent} />}
                  </View>
                )}
              </Pressable>
            );
          })}
          <TouchableOpacity
            onPress={() => { setCreating(true); setError(null); }}
            style={[styles.row, styles.newRow, { borderColor: P.border }]}
            activeOpacity={0.7}
          >
            <View style={[styles.newIcon, { backgroundColor: P.surface }]}>
              <Ionicons name="add" size={24} color={P.text} />
            </View>
            <Text style={[styles.rowName, { color: P.text }]}>New collection</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {creating && (
        <View style={styles.createWrap}>
          <CollectionForm
            name={name}
            color={color}
            onChangeName={setName}
            onChangeColor={setColor}
            onSubmit={handleCreate}
            autoFocus
          />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        {creating && collections.length > 0 && (
          <TouchableOpacity
            onPress={() => { setCreating(false); setError(null); }}
            style={[styles.button, { backgroundColor: P.surface }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: P.text }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={creating ? handleCreate : closeSheet}
          style={[styles.button, styles.primary, { backgroundColor: P.accent }]}
          activeOpacity={0.7}
          disabled={busyId === 'new'}
        >
          {busyId === 'new' ? (
            <ActivityIndicator color={P.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: P.onAccent }]}>{creating ? 'Make it and add' : 'Done'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </CollectionSheetFrame>
  );
}

function SheetFolder({ collection }: { collection: ExploreCollection }) {
  const photos = useFolderPhotos(collection.itemIds);
  return (
    <CollectionFolder
      name={collection.name}
      count={collection.itemIds.length}
      color={collection.color}
      photos={photos}
      width={64}
      hideLabel
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 380 },
  listContent: { gap: 10, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    paddingRight: 16,
    borderRadius: 18,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '700', fontSize: 16 },
  rowCount: { fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '600', fontSize: 13 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRow: { borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent' },
  newIcon: { width: 64, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  createWrap: { paddingTop: 2 },
  error: {
    color: '#C0392B',
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 12,
  },
  footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
  button: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 2 },
  buttonText: { fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '700', fontSize: 16 },
});
