import { create } from 'zustand';

interface ExploreFocusStore {
  isExploreFocused: boolean;
  setExploreFocused: (focused: boolean) => void;
}

// Lets IslandPillTabBar know when the Explore tab's own root screen (not a
// pushed screen like Search or a provider profile) is the visible screen, so
// its scroll-driven hide/opacity treatment only ever applies there.
export const useExploreFocusStore = create<ExploreFocusStore>((set) => ({
  isExploreFocused: false,
  setExploreFocused: (focused: boolean) => set({ isExploreFocused: focused }),
}));
