import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useCollectionsStore } from '../../stores/useCollectionsStore';
import { COLLECTION_COLORS, type CollectionColor, type ExploreCollection } from '../../types/collections';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { CollectionForm } from './CollectionForm';
import { CollectionSheetFrame } from './CollectionSheetFrame';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface CollectionEditorSheetProps {
  visible: boolean;
  /** Leave out to make a new, empty collection. */
  collection?: ExploreCollection | undefined;
  onClose: () => void;
  /** After a delete, so the screen can leave the folder it was showing. */
  onDeleted?: (collectionId: string) => void;
}

/** Make a collection, or rename, recolour or delete one. */
export function CollectionEditorSheet({ visible, collection, onClose, onDeleted }: CollectionEditorSheetProps) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const { palette: P } = useTheme();
  const create = useCollectionsStore(s => s.create);
  const update = useCollectionsStore(s => s.update);
  const remove = useCollectionsStore(s => s.remove);

  const [name, setName] = useState('');
  const [color, setColor] = useState<CollectionColor>('pink');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const count = useCollectionsStore.getState().collections.length;
    setName(collection?.name ?? '');
    setColor(collection?.color ?? COLLECTION_COLORS[count % COLLECTION_COLORS.length] ?? 'pink');
    setConfirmingDelete(false);
    setBusy(false);
    setError(null);
  }, [visible, collection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (busy) return;
    if (!name.trim()) {
      setError(tr('shared.newc.giveYourCollectionAName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (collection) await update(collection.id, { name, color });
      else await create(name, color);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } catch (e) {
      setError(toUserMessageAllowingDbGuard(e, "Couldn't save that collection. Try again.", 'collections.save'));
    } finally {
      setBusy(false);
    }
  }, [busy, collection, color, create, name, onClose, update]);

  const handleDelete = useCallback(async () => {
    if (!collection || busy) return;
    setBusy(true);
    setError(null);
    try {
      await remove(collection.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDeleted?.(collection.id);
      onClose();
    } catch (e) {
      setError(toUserMessageAllowingDbGuard(e, "Couldn't delete that collection. Try again.", 'collections.delete'));
    } finally {
      setBusy(false);
    }
  }, [busy, collection, onClose, onDeleted, remove]);

  const deleting = confirmingDelete && collection;
  return (
    <CollectionSheetFrame
      visible={visible}
      title={deleting ? tr('shared.newc2.deleteQ', { name: collection.name }) : collection ? tr('shared.newc2.editCollection') : 'New collection'}
      subtitle={
        deleting
          ? tr('shared.newc.onlyTheFolderGoesEveryLook')
          : collection
            ? undefined
            : 'Heart a look in Explore, then add it here.'
      }
      onClose={onClose}
    >
      {deleting ? (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => setConfirmingDelete(false)}
              style={[styles.button, { backgroundColor: P.surface }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, { color: P.text }]}>{tr('shared.newc.keepIt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              style={[styles.button, { backgroundColor: DESTRUCTIVE }]}
              activeOpacity={0.7}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>{tr('common.delete')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={collection ? styles.formTop : undefined}>
            <CollectionForm
              name={name}
              color={color}
              onChangeName={setName}
              onChangeColor={setColor}
              onSubmit={handleSave}
              autoFocus={!collection}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.button, { backgroundColor: P.accent }]}
              activeOpacity={0.7}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={P.onAccent} />
              ) : (
                <Text style={[styles.buttonText, { color: P.onAccent }]}>{collection ? tr('common.save') : tr('shared.newc.makeCollection')}</Text>
              )}
            </TouchableOpacity>
          </View>
          {collection && (
            <TouchableOpacity onPress={() => setConfirmingDelete(true)} style={styles.deleteLink} activeOpacity={0.7}>
              <Text style={styles.deleteText}>{tr('shared.newc.deleteCollection')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </CollectionSheetFrame>
  );
}

const DESTRUCTIVE = '#C0392B';

const styles = StyleSheet.create({
  formTop: { marginTop: 14 },
  error: {
    color: DESTRUCTIVE,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 12,
  },
  footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
  button: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 16 },
  deleteLink: { alignSelf: 'center', paddingVertical: 14 },
  deleteText: { color: DESTRUCTIVE, fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 15 },
});
