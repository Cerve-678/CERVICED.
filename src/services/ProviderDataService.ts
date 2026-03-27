// Updated provider data using business names as IDs (like Uber)

// Define the Provider type if not imported
export type Provider = {
  id: string;
  name: string;
  service: string;
  logo: any;
  location?: string;
  totalSlots?: number;
  bookedSlots?: number;
  // Availability settings - providers can customize these
  availability?: {
    // Days of the week the provider works (0 = Sunday, 6 = Saturday)
    workingDays: number[];
    // Working hours (in 24h format)
    startHour: number;
    endHour: number;
    // Lunch break (optional)
    lunchBreak?: {
      start: string; // e.g., "12:00 PM"
      end: string;   // e.g., "1:00 PM"
    };
    // Custom blocked times (specific times provider doesn't work)
    blockedTimes?: string[];
    // Blocked dates (holidays, vacations, etc.)
    blockedDates?: string[];
    // Slot duration in minutes (default 60)
    slotDurationMinutes?: number;
    // Maximum bookings per day (optional capacity limit)
    maxDailyBookings?: number;
  };
};

// All provider data is now served from Supabase — see databaseService.getProviders()

export const getProviderById = (_id: string): Provider | undefined => undefined;
export const getProviderByName = (_name: string): Provider | undefined => undefined;
export const isProviderFullyBooked = (_provider: Provider): boolean => false;
export const getAvailableSlotCount = (_provider: Provider): number => 0;
export const getProvidersByService = (_service: string): Provider[] => [];
export const getAvailableProviders = (): Provider[] => [];
};