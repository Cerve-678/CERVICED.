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

export const sampleProviders: Provider[] = [
  {
    id: 'diva-nails', // Business name as ID
    name: 'Diva Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/divanails.png'),
    location: 'London',
    totalSlots: 20,
    bookedSlots: 5
  },
  {
    id: 'jana-aesthetics',
    name: 'Jana Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/janaaesthetics.png'),
    location: 'London',
    totalSlots: 15,
    bookedSlots: 12
  },
  {
    id: 'her-brows',
    name: 'Her Brows',
    service: 'BROWS',
    logo: require('../../assets/logos/herbrows.png'),
    location: 'Birmingham',
    totalSlots: 18,
    bookedSlots: 18
  },
  {
    id: 'kiki-nails',
    name: 'Kiki Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/kikisnails.png'),
    location: 'Manchester',
    totalSlots: 25,
    bookedSlots: 8
  },
  {
    id: 'makeup-by-mya',
    name: 'Makeup by Mya',
    service: 'MUA',
    logo: require('../../assets/logos/makeupbymya.png'),
    location: 'London',
    totalSlots: 12,
    bookedSlots: 3
  },
  {
    id: 'hair-by-jennifer',
    name: 'Hair by Jennifer',
    service: 'HAIR',
    logo: require('../../assets/logos/hairbyjennifer.png'),
    location: 'Leeds',
    totalSlots: 20,
    bookedSlots: 16
  },
  {
    id: 'styled-by-kathrine', // This should match ProviderProfileScreen
    name: 'Styled by Kathrine',
    service: 'HAIR',
    logo: require('../../assets/logos/styledbykathrine.png'),
    location: 'London',
    totalSlots: 18,
    bookedSlots: 4
  },
  {
    id: 'vikki-laid',
    name: 'Vikki Laid',
    service: 'HAIR',
    logo: require('../../assets/logos/vikkilaid.png'),
    location: 'Birmingham',
    totalSlots: 22,
    bookedSlots: 22
  },
  {
    id: 'your-lashed',
    name: 'Your Lashed',
    service: 'LASHES',
    logo: require('../../assets/logos/yourlashed.png'),
    location: 'Manchester',
    totalSlots: 16,
    bookedSlots: 7
  },
  {
    id: 'rosemay-aesthetics',
    name: 'RoseMay Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/RoseMayAesthetics.png'),
    location: 'Bristol',
    totalSlots: 14,
    bookedSlots: 11
  },
  {
    id: 'fillerbyjess',
    name: 'Filler by Jess',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/fillerbyjess.png'),
    location: 'London',
    totalSlots: 10,
    bookedSlots: 2
  },
  {
    id: 'eyebrowdeluxe',
    name: 'Eyebrow Deluxe',
    service: 'BROWS',
    logo: require('../../assets/logos/eyebrowdeluxe.png'),
    location: 'Liverpool',
    totalSlots: 20,
    bookedSlots: 13
  },
  {
    id: 'lashesgalore',
    name: 'Lashes Galore',
    service: 'LASHES',
    logo: require('../../assets/logos/lashesgalore.png'),
    location: 'Manchester',
    totalSlots: 18,
    bookedSlots: 5
  },
  {
    id: 'zeenail-artist',
    name: 'Zee Nail Artist',
    service: 'NAILS',
    logo: require('../../assets/logos/ZeeNail Artist.png'),
    location: 'Glasgow',
    totalSlots: 24,
    bookedSlots: 24
  },
  {
    id: 'painted-by-zoe',
    name: 'Painted by Zoe',
    service: 'MUA',
    logo: require('../../assets/logos/paintedbyZoe.png'),
    location: 'Edinburgh',
    totalSlots: 15,
    bookedSlots: 6
  },
  {
    id: 'braided-slick',
    name: 'Braided Slick',
    service: 'HAIR',
    logo: require('../../assets/logos/braided slick.png'),
    location: 'Birmingham',
    totalSlots: 16,
    bookedSlots: 10
  },
  {
    id: 'lash-bae',
    name: 'Lash Bae',
    service: 'LASHES',
    logo: require('../../assets/logos/LashBae.png'),
    location: 'London',
    totalSlots: 20,
    bookedSlots: 1
  }
];

// Helper functions for provider availability

/**
 * Get a provider by ID
 */
export const getProviderById = (id: string): Provider | undefined => {
  return sampleProviders.find(p => p.id === id);
};

/**
 * Get a provider by name (case-insensitive partial match)
 */
export const getProviderByName = (name: string): Provider | undefined => {
  const normalizedName = name.toLowerCase();
  return sampleProviders.find(p =>
    p.name.toLowerCase() === normalizedName ||
    p.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(p.name.toLowerCase())
  );
};

/**
 * Check if a provider is fully booked (all slots taken)
 */
export const isProviderFullyBooked = (provider: Provider): boolean => {
  if (!provider.totalSlots || !provider.bookedSlots) return false;
  return provider.bookedSlots >= provider.totalSlots;
};

/**
 * Get available slot count for a provider
 */
export const getAvailableSlotCount = (provider: Provider): number => {
  if (!provider.totalSlots) return 0;
  const booked = provider.bookedSlots || 0;
  return Math.max(0, provider.totalSlots - booked);
};

/**
 * Get providers by service type
 */
export const getProvidersByService = (service: string): Provider[] => {
  return sampleProviders.filter(p =>
    p.service.toLowerCase() === service.toLowerCase()
  );
};

/**
 * Get providers with available slots
 */
export const getAvailableProviders = (): Provider[] => {
  return sampleProviders.filter(p => !isProviderFullyBooked(p));
};