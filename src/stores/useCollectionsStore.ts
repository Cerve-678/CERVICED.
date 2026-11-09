import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  addItemToCollection,
  createCollection,
  deleteCollection,
  getMyCollections,
  removeItemFromCollection,
  updateCollection,
} from '../services/databaseService';
import type { CollectionColor, ExploreCollection } from '../types/collections';
import { logger } from '../utils/logger';

/**
 * Where an "add to a collection" offer belongs. The Explore grid and the
 * full-screen photo sheet each draw their own bar and folder sheet, because
 * the photo sheet is a native Modal: anything the grid draws sits underneath
 * it. Each host only shows offers tagged with its own name.
 */
export type CollectionHost = 'explore' | 'imageDetail';

interface CollectionOffer {
  itemId: string;
  host: CollectionHost;
  /** Changes on every offer, so the bar restarts its timer for a new heart. */
  key: number;
}

interface CollectionsStore {
  collections: ExploreCollection[];
  /** Whose collections are loaded; reloaded when the signed-in account changes. */
  loadedForUserId: string | null;
  load: (userId: string | null) => Promise<void>;

  /** Each mutation updates the screen first and puts it back if the save fails, then throws. */
  create: (name: string, color: CollectionColor) => Promise<ExploreCollection>;
  update: (collectionId: string, changes: { name?: string; color?: CollectionColor }) => Promise<void>;
  remove: (collectionId: string) => Promise<void>;
  toggleItem: (collectionId: string, itemId: string) => Promise<void>;
  /** Local mirror of the database trigger that takes an un-hearted photo out of every collection. */
  forgetItem: (itemId: string) => void;

  offer: CollectionOffer | null;
  offerFor: (itemId: string, host: CollectionHost) => void;
  clearOffer: () => void;

  sheet: { itemId: string; host: CollectionHost } | null;
  openSheet: (itemId: string, host: CollectionHost) => void;
  closeSheet: () => void;
  /** Close whatever this host has open, e.g. when its screen or modal goes away. */
  dismissHost: (host: CollectionHost) => void;

  /** Photo for each saved item id the app has seen, so folders can show them anywhere. */
  photos: Record<string, string>;
  rememberPhotos: (entries: { id: string; uri: string | null | undefined }[]) => void;
}

let offerKey = 0;

/** How many of a folder's newest looks stick out of it. */
export const FOLDER_PHOTO_COUNT = 4;

/**
 * The newest looks a folder draws, with their photos. Subscribes to just
 * those few photos, so remembering others doesn't re-draw every folder.
 */
export function useFolderPhotos(itemIds: string[]): { id: string; uri: string | null }[] {
  const ids = itemIds.slice(-FOLDER_PHOTO_COUNT);
  const uris = useCollectionsStore(useShallow(s => ids.map(id => s.photos[id] ?? null)));
  return ids.map((id, i) => ({ id, uri: uris[i] ?? null }));
}

export const useCollectionsStore = create<CollectionsStore>((set, get) => ({
  collections: [],
  loadedForUserId: null,

  load: async (userId) => {
    if (!userId) {
      set({ collections: [], loadedForUserId: null, offer: null, sheet: null, photos: {} });
      return;
    }
    if (get().loadedForUserId !== userId) set({ collections: [], loadedForUserId: userId });
    try {
      const collections = await getMyCollections();
      if (get().loadedForUserId === userId) set({ collections });
    } catch (error) {
      // Favourites still works without folders; the row just stays as it was.
      logger.error('Failed to load collections:', error);
    }
  },

  create: async (name, color) => {
    const created = await createCollection(name, color);
    set({ collections: [...get().collections, created] });
    return created;
  },

  update: async (collectionId, changes) => {
    const before = get().collections;
    set({
      collections: before.map(c => (c.id === collectionId ? { ...c, ...changes, name: changes.name?.trim() ?? c.name } : c)),
    });
    try {
      await updateCollection(collectionId, changes);
    } catch (error) {
      set({ collections: before });
      throw error;
    }
  },

  remove: async (collectionId) => {
    const before = get().collections;
    set({ collections: before.filter(c => c.id !== collectionId) });
    try {
      await deleteCollection(collectionId);
    } catch (error) {
      set({ collections: before });
      throw error;
    }
  },

  toggleItem: async (collectionId, itemId) => {
    const before = get().collections;
    const target = before.find(c => c.id === collectionId);
    if (!target) return;
    const has = target.itemIds.includes(itemId);
    set({
      collections: before.map(c =>
        c.id === collectionId
          ? { ...c, itemIds: has ? c.itemIds.filter(id => id !== itemId) : [...c.itemIds, itemId] }
          : c,
      ),
    });
    try {
      if (has) await removeItemFromCollection(collectionId, itemId);
      else await addItemToCollection(collectionId, itemId);
    } catch (error) {
      set({ collections: before });
      throw error;
    }
  },

  forgetItem: (itemId) => {
    const { collections, offer } = get();
    if (!collections.some(c => c.itemIds.includes(itemId)) && offer?.itemId !== itemId) return;
    set({
      collections: collections.map(c =>
        c.itemIds.includes(itemId) ? { ...c, itemIds: c.itemIds.filter(id => id !== itemId) } : c,
      ),
      offer: offer?.itemId === itemId ? null : offer,
    });
  },

  offer: null,
  offerFor: (itemId, host) => {
    offerKey += 1;
    set({ offer: { itemId, host, key: offerKey } });
  },
  clearOffer: () => set({ offer: null }),

  sheet: null,
  openSheet: (itemId, host) => set({ sheet: { itemId, host }, offer: null }),
  closeSheet: () => set({ sheet: null }),
  dismissHost: (host) => {
    const { offer, sheet } = get();
    if (offer?.host !== host && sheet?.host !== host) return;
    set({
      offer: offer?.host === host ? null : offer,
      sheet: sheet?.host === host ? null : sheet,
    });
  },

  photos: {},
  rememberPhotos: (entries) => {
    const current = get().photos;
    let next: Record<string, string> | null = null;
    for (const { id, uri } of entries) {
      if (!uri || current[id] === uri) continue;
      if (!next) next = { ...current };
      next[id] = uri;
    }
    if (next) set({ photos: next });
  },
}));
