import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  addBookmark as dbAddBookmark,
  removeBookmark as dbRemoveBookmark,
  getBookmarkedProviders,
  getSavedPortfolioIds,
  savePortfolioItemToDb,
  unsavePortfolioItemFromDb,
} from '../services/databaseService';

interface BookmarkStore {
  // Provider bookmarks (existing)
  bookmarkedIds: string[];
  isBookmarked: (id: string) => boolean;
  addBookmark: (id: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  loadBookmarks: () => Promise<void>;

  // Portfolio/image bookmarks (new)
  savedPortfolioIds: string[];
  isPortfolioSaved: (id: string) => boolean;
  savePortfolioItem: (id: string) => Promise<void>;
  unsavePortfolioItem: (id: string) => Promise<void>;
  loadSavedPortfolio: () => Promise<void>;
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarkedIds: [],
  savedPortfolioIds: [],

  isBookmarked: (id: string) => {
    return get().bookmarkedIds.includes(id);
  },

  addBookmark: async (id: string) => {
    const current = get().bookmarkedIds;
    if (!current.includes(id)) {
      const updated = [...current, id];
      set({ bookmarkedIds: updated });
      try {
        await storage.setItem(STORAGE_KEYS.BOOKMARKED_VIDEOS, updated);
        await dbAddBookmark(id);
      } catch (error) {
        console.error('Failed to save bookmark:', error);
        set({ bookmarkedIds: current });
      }
    }
  },

  removeBookmark: async (id: string) => {
    const current = get().bookmarkedIds;
    const updated = current.filter(bid => bid !== id);
    set({ bookmarkedIds: updated });
    try {
      await storage.setItem(STORAGE_KEYS.BOOKMARKED_VIDEOS, updated);
      await dbRemoveBookmark(id);
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
      set({ bookmarkedIds: current });
    }
  },

  loadBookmarks: async () => {
    try {
      // Try Supabase first, fall back to AsyncStorage
      const dbProviders = await getBookmarkedProviders().catch(() => null);
      if (dbProviders && dbProviders.length > 0) {
        const ids = dbProviders.map(p => p.id);
        const unique = [...new Set(ids)];
        set({ bookmarkedIds: unique });
        await storage.setItem(STORAGE_KEYS.BOOKMARKED_VIDEOS, unique);
        if (__DEV__) console.log('Loaded bookmarks from Supabase:', unique.length);
        return;
      }
      // Fallback to local cache
      const local = await storage.getItem<string[]>(STORAGE_KEYS.BOOKMARKED_VIDEOS) || [];
      const unique = [...new Set(local)];
      set({ bookmarkedIds: unique });
      if (__DEV__) console.log('Loaded bookmarks from local:', unique.length);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      set({ bookmarkedIds: [] });
    }
  },

  // Portfolio bookmarks
  isPortfolioSaved: (id: string) => {
    return get().savedPortfolioIds.includes(id);
  },

  savePortfolioItem: async (id: string) => {
    const current = get().savedPortfolioIds;
    if (!current.includes(id)) {
      const updated = [...current, id];
      set({ savedPortfolioIds: updated });
      try {
        await storage.setItem(STORAGE_KEYS.SAVED_PORTFOLIO, updated);
        await savePortfolioItemToDb(id);
      } catch (error) {
        console.error('Failed to save portfolio item:', error);
        set({ savedPortfolioIds: current });
      }
    }
  },

  unsavePortfolioItem: async (id: string) => {
    const current = get().savedPortfolioIds;
    const updated = current.filter(pid => pid !== id);
    set({ savedPortfolioIds: updated });
    try {
      await storage.setItem(STORAGE_KEYS.SAVED_PORTFOLIO, updated);
      await unsavePortfolioItemFromDb(id);
    } catch (error) {
      console.error('Failed to unsave portfolio item:', error);
      set({ savedPortfolioIds: current });
    }
  },

  loadSavedPortfolio: async () => {
    try {
      // Try Supabase first, fall back to AsyncStorage
      const dbIds = await getSavedPortfolioIds().catch(() => null);
      if (dbIds && dbIds.length > 0) {
        const unique = [...new Set(dbIds)];
        set({ savedPortfolioIds: unique });
        await storage.setItem(STORAGE_KEYS.SAVED_PORTFOLIO, unique);
        if (__DEV__) console.log('Loaded saved portfolio from Supabase:', unique.length);
        return;
      }
      const saved = await storage.getItem<string[]>(STORAGE_KEYS.SAVED_PORTFOLIO) || [];
      const uniqueSaved = [...new Set(saved)];
      set({ savedPortfolioIds: uniqueSaved });
      if (__DEV__) console.log('Loaded saved portfolio from local:', uniqueSaved.length);
    } catch (error) {
      console.error('Failed to load saved portfolio:', error);
      set({ savedPortfolioIds: [] });
    }
  },
}));
