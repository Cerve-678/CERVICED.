import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../utils/storage';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Service {
  id: number;
  name: string;
  price: number;
  duration: string;
  description: string;
  image: any;
}

export interface CartItem {
  providerName: string;
  providerImage: any;
  providerService: string;
  service: Service & { instanceId: number };
  quantity: number;
}

interface AppState {
  // User & Auth
  user: User | null;
  isAuthenticated: boolean;
  authToken: string | null;
  // App State
  isLoading: boolean;
  isInitialized: boolean;
  items: CartItem[];
  // Actions
  setUser: (user: User | null) => void;
  setAuthToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeApp: () => Promise<void>;
  addToCart: (item: CartItem) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  authToken: null,
  isLoading: false,
  isInitialized: false,
  items: [],
  // Basic setters
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAuthToken: (authToken) => set({ authToken }),
  setLoading: (isLoading) => set({ isLoading }),
  addToCart: (item) => set((state) => ({ items: [...state.items, item] })),
  // Authentication actions
  login: async (user: User, token: string) => {
    try {
      set({ isLoading: true });
      // Store auth data
      await storage.setItem(STORAGE_KEYS.USER_DATA, user);
      await storage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      set({
        user,
        authToken: token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Login error:', error);
      set({ isLoading: false, isAuthenticated: false });
      // Surface to caller — callers must wrap in try/catch or .catch()
      throw error;
    }
  },
  logout: async () => {
    try {
      set({ isLoading: true });
      // Clear stored auth data
      await storage.removeItem(STORAGE_KEYS.USER_DATA);
      await storage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
      // Storage cleanup failed — still clear in-memory state so user isn't stuck
      console.error('Logout storage cleanup error:', error);
    } finally {
      set({
        user: null,
        authToken: null,
        isAuthenticated: false,
        isLoading: false,
        items: [],
      });
    }
  },
  initializeApp: async () => {
    try {
      set({ isLoading: true });
      // Try to restore user session
      const [storedUser, storedToken] = await Promise.all([
        storage.getItem<User>(STORAGE_KEYS.USER_DATA),
        storage.getItem<string>(STORAGE_KEYS.AUTH_TOKEN),
      ]);
      if (storedUser && storedToken) {
        set({
          user: storedUser,
          authToken: storedToken,
          isAuthenticated: true,
        });
      }
      set({
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('App initialization error:', error);
      set({
        isInitialized: true,
        isLoading: false,
      });
    }
  },
}));