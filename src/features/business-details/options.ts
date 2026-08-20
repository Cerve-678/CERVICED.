/**
 * Static option lists for the Business Details screens.
 *
 * Extracted from ProviderBusinessEmailScreen.tsx when it was split into a hub
 * plus three sub-screens, so the lists have one home rather than being copied
 * into each screen that renders them.
 *
 * Where an option list maps to a DB column with a CHECK constraint, the
 * `value` is the canonical lowercase DB value and `label` is display-only.
 * Storing the label instead of the value has silently desynced this table
 * before (see preferred_contact_methods) — always map at the render boundary.
 */

export const SPECIALTIES_MAP: Record<string, string[]> = {
  HAIR:       ['Natural & textured', 'Afro hair', 'Colour & balayage', 'Extensions & weaves', 'Locs & braids', 'Bridal & occasion', "Men's cuts", "Children's hair", 'Relaxers & perms', 'Blow-dries & styling'],
  NAILS:      ['Nail art', 'Acrylic sets', 'Gel manicure', 'Infills', 'Gel extensions', 'Pedicures', 'SNS/dip powder', 'Gel-X'],
  LASHES:     ['Classic lashes', 'Volume', 'Mega volume', 'Hybrid', 'Lash lifts', 'Lash tints'],
  BROWS:      ['Threading', 'Waxing', 'Lamination', 'Microblading', 'Nano brows', 'Henna brows', 'Tinting & shaping'],
  MUA:        ['Bridal', 'Prom & occasion', 'Editorial', 'Airbrush', 'Film & TV', 'SFX', 'All skin tones', 'Deep/dark skin specialist'],
  AESTHETICS: ['Facials', 'Microneedling', 'Chemical peels', 'LED therapy', 'Dermaplaning', 'Injectables', 'Body treatments'],
  OTHER:      ['Massage', 'Body waxing', 'Spray tanning', 'Body sculpting', 'Holistic therapies'],
};

export const CLIENTELE_OPTS     = ['Women', 'Men', 'Children', 'Seniors', 'Bridal & wedding parties', 'All welcome'];
export const AVAILABILITY_OPTS  = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Saturdays', 'Sundays', 'Same-day bookings'];
// Signup's list (SignUpStep5Screen's LANGUAGE_OPTIONS) leads, in its order, so
// a provider sees the same chips selected here that they picked at signup.
// BSL in particular was missing from this list entirely: a provider who chose
// it at signup opened Business Details, found no BSL chip, and saving dropped
// the value. The extra languages after the signup set are additive — they only
// widen what can be picked later, they never orphan a signup answer.
//
// Signup also offers an "Other" free-text escape, so `languages_spoken` can
// legitimately hold a value outside this list. AboutYouScreen renders any such
// value as an extra chip rather than silently discarding it — never assume
// every stored language appears here.
export const LANGUAGE_OPTS      = ['English', 'Urdu', 'Punjabi', 'Polish', 'Arabic', 'French', 'Spanish', 'BSL', 'Bengali', 'Gujarati', 'Yoruba', 'Igbo', 'Twi/Akan', 'Somali', 'Portuguese', 'Mandarin', 'Hindi', 'Tamil', 'Turkish'];
export const STYLE_OPTS         = ['Natural & minimal', 'Full glam', 'Edgy & creative', 'Classic & timeless', 'Bohemian', 'Bridal & romantic', 'Editorial & high-fashion'];
export const ACCESSIBILITY_OPTS = ['Wheelchair accessible', 'Parking available', 'Ground floor access', 'Home visits for mobility', 'Step-free entrance'];

// NOTE: there is no SETTING_OPTS list here on purpose. The old "Where You
// Work" card asked for a single setting (salon / home studio / mobile), but
// that was replaced by a cities-covered selector on AboutYouScreen,
// which writes `service_locations` from src/constants/ukCities.ts — the same
// list the client Search "City" filter reads. The providers.service_setting
// column still exists (added alongside the other practice-detail columns) but
// is intentionally unwritten by the UI; see the follow-up note in MEMORY.

// Values match the canonical price_tier enum on `providers`.
export const PRICE_OPTS = [
  { value: 'budget',  label: '£  · Great value' },
  { value: 'mid',     label: '££  · Mid-range' },
  { value: 'premium', label: '£££  · Premium' },
  { value: 'luxury',  label: '££££  · Luxury' },
];

// Values match the live CHECK constraint providers_team_size_check.
export const TEAM_SIZE_OPTS = [
  { value: 'solo',       label: 'Just me' },
  { value: 'small_team', label: '2–5 people' },
  { value: 'large_team', label: '6+ people' },
];

// Canonical lowercase DB values with display labels. ChipGroup is string-only,
// so these are mapped to/from labels at the render boundary rather than storing
// the label — writing capitalized values into a lowercase enum column has
// desynced this table before.
export const PAYMENT_OPTS = [
  { value: 'card',          label: 'Card' },
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

// Values match the live CHECK constraint providers_accepts_new_clients_check.
export const NEW_CLIENTS_OPTS = [
  { value: 'yes',      label: 'Yes, open to new clients' },
  { value: 'waitlist', label: 'Waitlist only' },
  { value: 'no',       label: 'Not currently taking new clients' },
];

// ─── Scheduling ───────────────────────────────────────────────────────────────
// Moved out of ProviderAutomationsScreen's inline ChipSelect definitions when
// SchedulingScreen took over the booking rules, so the two screens can't drift
// apart on what the valid choices are. Values are the strings both screens
// parseInt() before writing to the providers row — keep them numeric-as-string
// ('0' meaning none/unlimited), not labels.

export const BUFFER_OPTS = [
  { value: '0',  label: 'None'   },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hr'   },
];

export const SLOT_INTERVAL_OPTS = [
  { value: '15', label: 'Every 15 min' },
  { value: '30', label: 'Every 30 min' },
  { value: '60', label: 'Every hour'   },
];

export const MIN_NOTICE_OPTS = [
  { value: '0',  label: 'None'   },
  { value: '1',  label: '1 hr'   },
  { value: '2',  label: '2 hrs'  },
  { value: '4',  label: '4 hrs'  },
  { value: '12', label: '12 hrs' },
  { value: '24', label: '24 hrs' },
];

// '0' is "any time" here — updateProviderScheduleSettings falls back to 60 on
// a parse failure, so the sentinel must stay a real '0', not an empty string.
export const BOOKING_WINDOW_OPTS = [
  { value: '14',  label: '2 weeks'  },
  { value: '30',  label: '1 month'  },
  { value: '60',  label: '2 months' },
  { value: '90',  label: '3 months' },
  { value: '180', label: '6 months' },
  { value: '0',   label: 'Any time' },
];

// 'unlimited' is mapped to the integer 0 at the save boundary (the providers
// column is an int, where 0 means no cap) — don't store the word.
export const MAX_PER_DAY_OPTS = [
  { value: 'unlimited', label: 'Unlimited' },
  { value: '4',         label: '4'         },
  { value: '6',         label: '6'         },
  { value: '8',         label: '8'         },
  { value: '10',        label: '10'        },
  { value: '12',        label: '12'        },
];

// Values match the live CHECK constraint providers_patch_test_policy_check.
export const PATCH_OPTS = [
  { value: 'always',      label: 'Always required' },
  { value: 'new_clients', label: 'New clients only' },
  { value: 'optional',    label: 'Recommended but optional' },
  { value: 'not_needed',  label: 'Not required for my services' },
];

// ─────────────────────────────────────────────────────────
// BUSINESS TYPE & ADDRESS RELEASE
// ─────────────────────────────────────────────────────────

export type BusinessType = 'salon' | 'studio' | 'home_based' | 'mobile';

export type AddressReleasePolicy =
  | 'always' | 'on_confirmation' | 'day_before' | 'two_days_before'
  | 'three_days_before' | 'five_days_before' | 'week_before' | 'manual';

export const BUSINESS_TYPE_OPTS: { value: BusinessType; label: string; sub: string }[] = [
  { value: 'salon',      label: 'Salon',       sub: 'Clients come to a commercial salon premises.' },
  { value: 'studio',     label: 'Studio',      sub: 'Clients come to a dedicated studio space.' },
  { value: 'home_based', label: 'Home Studio', sub: 'Clients come to your home — address stays private until you release it.' },
  { value: 'mobile',     label: 'Mobile',      sub: 'You travel to the client. Your address is never sent automatically — only if you send it yourself.' },
];

export const ADDRESS_RELEASE_OPTS: { value: AddressReleasePolicy; label: string; sub: string }[] = [
  { value: 'always',            label: 'Always visible',  sub: 'Your address is always visible to booked clients.' },
  { value: 'on_confirmation',   label: 'On confirmation', sub: 'Shared automatically when the booking is confirmed.' },
  { value: 'day_before',        label: '24h before',      sub: 'Shared automatically 24 hours before the appointment.' },
  { value: 'two_days_before',   label: '48h before',      sub: 'Shared automatically 48 hours before the appointment.' },
  { value: 'three_days_before', label: '72h before',      sub: 'Shared automatically 72 hours before the appointment.' },
  { value: 'five_days_before',  label: '5 days before',   sub: 'Shared automatically 5 days before the appointment.' },
  { value: 'week_before',       label: '1 week before',   sub: 'Shared automatically 1 week before the appointment.' },
  { value: 'manual',            label: 'Manual release',  sub: 'Nothing is sent automatically — you send your address per booking from that booking\u2019s detail page.' },
];

/**
 * Which address-release timings each business type may offer.
 *
 * Business type gates this list, so the two columns can disagree: a home_based
 * provider on 'week_before' who switches to 'salon' would keep a value salon
 * never offers — the picker would render with nothing selected while the DB
 * still held the stale timing. Anything that writes business_type must run the
 * new value through `reconcileAddressReleasePolicy` rather than writing the
 * type alone.
 *
 * Mobile gets 'manual' and nothing else. A mobile provider travels to the
 * client, so sharing their own address is the exception rather than the flow:
 * the default is not sharing at all (NULL policy), and if they do want to
 * share it, it's a deliberate per-booking send from the booking detail screen,
 * never a timer that fires on its own. Every timed option — and 'always' most
 * of all — would publish what is usually a home address on a schedule the
 * provider isn't watching.
 *
 * They used to be excluded from release entirely (empty list, picker hidden).
 * Nothing server-side ever keyed off business_type for this —
 * `is_address_released()` and the on-confirmation trigger are purely
 * policy-driven — so giving mobile a real policy is sufficient on its own and
 * needs no migration.
 */
export const ADDRESS_RELEASE_BY_BUSINESS_TYPE: Record<BusinessType, AddressReleasePolicy[]> = {
  salon:      ['always', 'on_confirmation'],
  studio:     ['always', 'on_confirmation'],
  home_based: ['on_confirmation', 'day_before', 'two_days_before', 'three_days_before', 'five_days_before', 'week_before', 'manual'],
  mobile:     ['manual'],
};

export function isAddressReleaseAllowed(
  businessType: BusinessType,
  policy: AddressReleasePolicy | null,
): boolean {
  return policy != null && ADDRESS_RELEASE_BY_BUSINESS_TYPE[businessType].includes(policy);
}

/**
 * The policy to store for `businessType`, keeping the current one when the new
 * type still offers it and falling back to the safest option it does offer.
 *
 * For mobile the safest option is NULL — not sharing at all. Every other type
 * falls back to 'on_confirmation', which is the product default for an address
 * clients are expected to travel to. Mobile must not inherit that default:
 * a mobile provider's address on file is usually their home, and every
 * existing mobile row has a NULL policy from when the type had no picker at
 * all. Returning 'on_confirmation' for them would start releasing a home
 * address to every confirmed client the next time that provider saved their
 * business info for any unrelated reason. Sharing has to be chosen, never
 * defaulted into.
 */
export function reconcileAddressReleasePolicy(
  businessType: BusinessType,
  current: AddressReleasePolicy | null,
): AddressReleasePolicy | null {
  if (isAddressReleaseAllowed(businessType, current)) return current;
  return businessType === 'mobile' ? null : 'on_confirmation';
}
