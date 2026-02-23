import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../utils/storage';

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
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
      set({ bookmarkedIds: current });
    }
  },

  loadBookmarks: async () => {
    try {
      const bookmarks = await storage.getItem<string[]>(STORAGE_KEYS.BOOKMARKED_VIDEOS) || [];
      const uniqueBookmarks = [...new Set(bookmarks)];
      set({ bookmarkedIds: uniqueBookmarks });
      if (uniqueBookmarks.length !== bookmarks.length) {
        await storage.setItem(STORAGE_KEYS.BOOKMARKED_VIDEOS, uniqueBookmarks);
      }
      if (__DEV__) {
        console.log('Loaded bookmarks:', uniqueBookmarks.length, 'providers');
      }
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
    } catch (error) {
      console.error('Failed to unsave portfolio item:', error);
      set({ savedPortfolioIds: current });
    }
  },

  loadSavedPortfolio: async () => {
    try {
      const saved = await storage.getItem<string[]>(STORAGE_KEYS.SAVED_PORTFOLIO) || [];
      const uniqueSaved = [...new Set(saved)];
      set({ savedPortfolioIds: uniqueSaved });
      if (uniqueSaved.length !== saved.length) {
        await storage.setItem(STORAGE_KEYS.SAVED_PORTFOLIO, uniqueSaved);
      }
      if (__DEV__) {
        console.log('Loaded saved portfolio:', uniqueSaved.length, 'items');
      }
    } catch (error) {
      console.error('Failed to load saved portfolio:', error);
      set({ savedPortfolioIds: [] });
    }
  },
}));
