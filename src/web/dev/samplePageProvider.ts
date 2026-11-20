/**
 * A made-up provider for the developer page-style preview (/_dev/page-styles),
 * shaped like a `providers` row so it goes through the same mapper a real
 * page will. Not real data and never shown on the live site.
 */
import { mapProviderProfileData } from '../../features/providers/profileMapper';
import type { ProviderProfileData } from '../../features/providers/profileTypes';
import type { ProviderReviewItem } from '../../features/providers/reviewPresentation';
import type { WeeklyOpeningHoursDay } from '../../services/AvailabilityService';
import type { PageStyleKey } from '../../constants/pageStyles';
import { DEFAULT_CARD_SHAPE, DEFAULT_HERO_FINISH, encodeThemeKey } from '../../constants/providerThemes';
import type { ProviderWithServices } from '../../types/database';

function service(id: string, type: string, category: string, name: string, price: number, minutes: number, description: string) {
  return {
    id,
    service_type: type,
    category_name: category,
    category_description: null,
    name,
    price: String(price),
    duration_minutes: minutes,
    description,
    images: [],
    add_ons: [],
    is_active: true,
  };
}

/** The sample provider, drawn in the given page style. */
export function samplePageProvider(pageStyle: PageStyleKey): ProviderProfileData {
  const row = {
    id: '00000000-0000-0000-0000-000000000000',
    slug: 'halo.lash',
    display_name: 'Halo Lash & Brow',
    service_category: 'LASHES',
    service_categories: ['LASHES', 'BROWS'],
    location_text: 'Hackney, London',
    business_type: 'home_based',
    rating: '4.9',
    about_text: 'Soft, natural lash sets and brow shaping from a calm home studio in Hackney. Ten years in, and still obsessed with the details.',
    profile_theme: encodeThemeKey('app', undefined, DEFAULT_HERO_FINISH, DEFAULT_CARD_SHAPE, pageStyle),
    instagram: 'halo.lash',
    years_experience: '10',
    specialties: ['Classic sets', 'Wispy hybrids', 'Brow lamination'],
    preferred_payment_methods: ['card'],
    booking_policies: { cancelNotice: '48', depositRequired: true, depositType: 'fixed', depositAmount: '15' },
    services: [
      service('s1', 'LASHES', 'Full Sets', 'Classic full set', 55, 90, 'One extension on each natural lash, for a clean, natural look.'),
      service('s2', 'LASHES', 'Full Sets', 'Hybrid full set', 65, 105, 'Classic and volume mixed, with a soft, textured finish.'),
      service('s3', 'LASHES', 'Infills', 'Classic infill', 35, 60, 'Within three weeks of your last set.'),
      service('s4', 'BROWS', 'Brows', 'Brow lamination', 40, 45, 'Brushed-up, set brows that last about six weeks.'),
      service('s5', 'BROWS', 'Brows', 'Tint and shape', 22, 30, ''),
    ],
  } as unknown as ProviderWithServices;
  return mapProviderProfileData(row);
}

export const SAMPLE_REVIEWS: ProviderReviewItem[] = [
  { id: 'r1', name: 'Amara', rating: 5, comment: 'So gentle, and my lashes have never looked this natural.', date: '2 weeks ago' },
  { id: 'r2', name: 'Jess', rating: 5, comment: 'Lovely studio, on time, and the brow lamination is perfect.', date: '1 month ago' },
];

const OPEN = (dayOfWeek: number, label: string, hours: string): WeeklyOpeningHoursDay =>
  ({ dayOfWeek, label, isOpen: true, hours }) as WeeklyOpeningHoursDay;
const CLOSED = (dayOfWeek: number, label: string): WeeklyOpeningHoursDay =>
  ({ dayOfWeek, label, isOpen: false, hours: null }) as WeeklyOpeningHoursDay;

export const SAMPLE_OPENING_HOURS: WeeklyOpeningHoursDay[] = [
  CLOSED(1, 'Monday'),
  OPEN(2, 'Tuesday', '10:00am - 6:00pm'),
  OPEN(3, 'Wednesday', '10:00am - 6:00pm'),
  OPEN(4, 'Thursday', '12:00pm - 8:00pm'),
  OPEN(5, 'Friday', '10:00am - 6:00pm'),
  OPEN(6, 'Saturday', '9:00am - 4:00pm'),
  CLOSED(0, 'Sunday'),
];
