// src/stores/useBookingStore.ts
// Zustand store for bookings — persisted to AsyncStorage.
// All DB access goes through bookingService; this store owns no supabase calls.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  fetchBookingsFromSupabase,
  cancelBookingInSupabase,
} from '../services/bookingService';
import type { ConfirmedBooking } from '../types/booking';
import { STORAGE_KEYS } from '../utils/storageKeys';

interface BookingStore {
  bookings: ConfirmedBooking[];
  isLoading: boolean;

  /** Replace the full bookings array (used by BookingContext to keep the
   *  store in sync after its own complex operations). */
  setBookings: (bookings: ConfirmedBooking[]) => void;

  /** Load bookings for the given userId from Supabase (simple fetch). */
  loadBookings: (userId: string) => Promise<void>;

  /** Same as loadBookings but always re-fetches even if already loaded. */
  refreshBookings: (userId: string) => Promise<void>;

  /** Cancel a booking in Supabase, then update the local list optimistically. */
  cancelBooking: (bookingId: string, reason?: string) => Promise<void>;

  /** Prepend a new booking to the local list (used after checkout). */
  addBooking: (booking: ConfirmedBooking) => void;
}

export const useBookingStore = create<BookingStore>()(
  persist(
    (set, get) => ({
      bookings: [],
      isLoading: false,

      setBookings: (bookings) => {
        set({ bookings });
      },

      loadBookings: async (userId) => {
        if (get().isLoading) return;
        set({ isLoading: true });
        try {
          const data = await fetchBookingsFromSupabase(userId);
          set({ bookings: data, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      refreshBookings: async (userId) => {
        set({ isLoading: true });
        try {
          const data = await fetchBookingsFromSupabase(userId);
          set({ bookings: data, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      cancelBooking: async (bookingId, reason) => {
        await cancelBookingInSupabase(bookingId, reason);
        set(state => ({
          bookings: state.bookings.map(b =>
            b.id === bookingId
              ? { ...b, status: 'cancelled' as ConfirmedBooking['status'] }
              : b
          ),
        }));
      },

      addBooking: (booking) => {
        set(state => ({ bookings: [booking, ...state.bookings] }));
      },
    }),
    {
      name: STORAGE_KEYS.BOOKINGS,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
