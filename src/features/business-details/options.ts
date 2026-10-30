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

import type { BusinessType, ServiceCategory } from '../../types/database';
import type { TranslationKey } from '../../i18n/types';

// Specialities are the specific, often culturally-named things a provider is
// known for — narrower than the macro service_category, broader than one
// service. They serve two jobs at once: the chips a provider picks on
// ServicesPricingScreen (stored in provider_specialties), AND the curated
// option list behind the client Search "Speciality" filter. The client filter
// matches these against a provider's specialities, per-service tags AND service
// names via fuzzy matching (src/utils/fuzzyMatch.ts), so the labels here are
// written as a client would recognise them — casing/spacing/spelling drift
// between this list and what a provider typed elsewhere is tolerated at match
// time, not something to normalise here. Each category carries its own set so
// a nail tech is never shown hair specialities.
export const SPECIALTIES_MAP: Record<string, string[]> = {
  HAIR:       ['Natural & textured', 'Afro hair', 'Silk press', 'Dominican blowout', 'Knotless braids', 'Box braids', 'Cornrows', 'Faux locs', 'Locs & retwists', 'Crochet', 'Wig install', 'Frontal & closure', 'Extensions & weaves', 'Colour & balayage', 'Keratin & smoothing', 'Relaxers & perms', 'Curly cuts', 'Blow-dries & styling', 'Barbering & fades', 'Bridal & occasion', "Men's cuts", "Children's hair"],
  NAILS:      ['BIAB / builder gel', 'Gel manicure', 'Acrylic sets', 'Gel extensions', 'Gel-X', 'Infills', 'Russian manicure', 'Polygel', 'SNS/dip powder', 'Nail art', 'Freehand art', 'Chrome & cat-eye', 'Ombré & baby boomer', 'French', 'Pedicures', 'Press-ons'],
  LASHES:     ['Classic lashes', 'Hybrid', 'Volume', 'Russian volume', 'Mega volume', 'Wispy / anime sets', 'Coloured lashes', 'Bottom lashes', 'Lash lifts', 'Lash tints', 'Cluster lashes'],
  BROWS:      ['Threading', 'Waxing', 'Lamination', 'Microblading', 'Ombré / powder brows', 'Combination brows', 'Nano brows', 'Henna brows', 'Brow mapping', 'Brow tint & lift', 'Tinting & shaping'],
  MUA:        ['Soft glam', 'Full glam', 'Natural / no-makeup', 'Bridal', 'South Asian bridal', 'African bridal', 'Prom & occasion', 'Editorial', 'Airbrush', 'Film & TV', 'SFX', 'Brown & Black skin specialist', 'Mature skin', 'Textured / acne-friendly skin', 'All skin tones'],
  AESTHETICS: ['Facials', 'Hydrafacial', 'Chemical peels', 'Microneedling', 'Dermaplaning', 'LED therapy', 'Acne treatments', 'Hyperpigmentation', 'Anti-wrinkle', 'Dermal fillers', 'Skin boosters', 'Laser hair removal', 'Body sculpting', 'Body treatments'],
  OTHER:      ['Massage', 'Body waxing', 'Spray tanning', 'Body sculpting', 'Holistic therapies'],
};

/** Every curated speciality across all categories, deduped in a stable order —
 *  the option pool for the client filter's "All" category tab, where no single
 *  category scopes the list. Order follows SPECIALTIES_MAP's category order. */
export const ALL_SPECIALTIES: string[] = [
  ...new Set(Object.values(SPECIALTIES_MAP).flat()),
];

/**
 * Every macro service type the app has ever stored, in display order —
 * `providers.service_category` / `providers.service_categories`.
 *
 * This list is for RENDERING a stored value, so it still carries retired types
 * (see SERVICE_TYPE_OPTS below for what can actually be picked). A provider
 * stamped with a retired type must still see its proper label rather than the
 * raw DB code. The live CHECK constraint providers_service_category_check also permits
 * MALE and KIDS, which are deliberately NOT offered here: those describe an
 * audience, not a trade, and are set per-service (`services.audience`) and
 * per-promotion rather than as a whole business's type.
 *
 * Keys of SPECIALTIES_MAP must stay in step with these values — the specialty
 * pool on ServicesPricingScreen is looked up by service_category, so a type
 * with no entry there would show a provider an empty specialty list.
 */
export const ALL_SERVICE_TYPE_OPTS: { value: ServiceCategory; label: string; sub: string }[] = [
  { value: 'HAIR',       label: 'Hair',       sub: 'Cuts, colour, braids, extensions, styling' },
  { value: 'NAILS',      label: 'Nails',      sub: 'Manicures, pedicures, extensions, nail art' },
  { value: 'LASHES',     label: 'Lashes',     sub: 'Extensions, lifts, tints' },
  { value: 'BROWS',      label: 'Brows',      sub: 'Shaping, lamination, microblading, tinting' },
  { value: 'MUA',        label: 'Makeup',     sub: 'Bridal, occasion, editorial, SFX' },
  { value: 'AESTHETICS', label: 'Aesthetics', sub: 'Facials, peels, microneedling, injectables' },
  { value: 'OTHER',      label: 'Other',      sub: 'Massage, waxing, tanning, holistic therapies' },
];

/**
 * What a provider may actually pick — ALL_SERVICE_TYPE_OPTS minus the retired
 * ones. Use this for any picker; use ALL_SERVICE_TYPE_OPTS to render a value
 * that already exists.
 *
 * OTHER is retired. It was a catch-all that told a client nothing, put its
 * providers in a bucket no one browses, and forced a free-text
 * `custom_service_type` alongside it that no filter, tab or search could read.
 * Providers already stamped OTHER keep the value and still render (that's what
 * ALL_SERVICE_TYPE_OPTS is for) — it simply can't be chosen again. Anything
 * reading `custom_service_type` is legacy display for exactly those rows.
 */
export const SERVICE_TYPE_OPTS = ALL_SERVICE_TYPE_OPTS.filter(
  option => option.value !== 'OTHER',
);

// The pickable values as bare strings, for InfoRegScreen's sign-up picker,
// which renders its own chips and needs only the ordered values. Derived from
// SERVICE_TYPE_OPTS rather than written out a second time: these two lists
// must offer the same types in the same order, and the surest way to keep
// them in step is for there to be only one of them. Deriving it from the
// PICKABLE list, not ALL_SERVICE_TYPE_OPTS, is what retires OTHER from sign-up
// as well as from Business Info without either screen naming it. Locked in
// InfoRegScreen once a profile exists — BusinessInfoScreen is the only place
// the set can be changed afterwards (with a 90-day cooldown) — because
// subcategory suggestions, tag pools and templates are all scoped off it.
export const SERVICE_CATEGORY_OPTS: readonly ServiceCategory[] =
  SERVICE_TYPE_OPTS.map(option => option.value);

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
// The generic fallback list, also used for OTHER-category providers. Kept as
// the base so anything importing STYLE_OPTS still resolves; the per-category
// lists below are what ServicesPricingScreen actually renders.
export const STYLE_OPTS         = ['Natural & minimal', 'Full glam', 'Edgy & creative', 'Classic & timeless', 'Bohemian', 'Bridal & romantic', 'Editorial & high-fashion'];

/**
 * Provider-level "style aesthetic" choices (providers.style_tags), tailored to
 * the provider's service_category rather than one hair/makeup-flavoured list
 * shown to every trade — a nail tech has no use for "Bohemian", and a lash
 * artist thinks in "wispy / doll / cat-eye", not "Full glam".
 *
 * These are capitalized, client-facing labels stored whole in providers.style_tags
 * (the provider-level claim). They are deliberately distinct from InfoRegScreen's
 * lowercase per-SERVICE STYLE_TAGS_BY_CATEGORY — that vocabulary tags an
 * individual service, this one describes the whole business. Modelled on the
 * same category shapes so the two read as one product, not two taxonomies.
 *
 * A category with no entry (or an unknown/legacy value) falls back to STYLE_OPTS.
 * ServicesPricingScreen additionally unions in any already-stored value so a
 * provider never loses a tag chosen under the old generic list.
 */
export const STYLE_AESTHETIC_MAP: Record<string, string[]> = {
  HAIR:       ['Natural & minimal', 'Sleek & polished', 'Lived-in & undone', 'Bohemian', 'Edgy & creative', 'Classic & timeless', 'Bridal & romantic', 'Editorial & high-fashion', 'Colour specialist'],
  NAILS:      ['Natural & minimal', 'Intricate nail art', 'Bold & statement', 'Trend-led', 'Chrome & metallics', 'French-inspired', 'Classic & timeless', 'Bridal & occasion', 'Editorial & high-fashion'],
  LASHES:     ['Natural & subtle', 'Wispy & textured', 'Full & dramatic', 'Doll & cat-eye', 'Classic & timeless', 'Bridal & occasion', 'Editorial & high-fashion'],
  BROWS:      ['Natural & fluffy', 'Soft & feathered', 'Bold & defined', 'Sculpted & arched', 'Classic & timeless', 'Bridal & occasion', 'Editorial & high-fashion'],
  MUA:        ['Natural & minimal', 'Full glam', 'Soft glam', 'Dewy & fresh', 'Bold & creative', 'Classic & timeless', 'Bridal & romantic', 'Editorial & high-fashion', 'SFX & character'],
  AESTHETICS: ['Natural enhancement', 'Results-driven', 'Preventative & anti-ageing', 'Relaxing & restorative', 'Clinical & advanced', 'Holistic', 'Glow-up & event prep'],
  OTHER:      STYLE_OPTS,
};

/** The generic products hint, used for OTHER-category and unknown values. */
export const PRODUCTS_PLACEHOLDER_DEFAULT = 'e.g. the brands and products you work with...';

/** Category-tailored hint for the free-text "Products & brands you use" field. */
export const PRODUCTS_PLACEHOLDER_MAP: Record<string, string> = {
  HAIR:       "e.g. Olaplex, KÉRASTASE, Redken, Wella, L'Oréal...",
  NAILS:      'e.g. The GelBottle, Mylee, OPI, Gelish, CND...',
  LASHES:     'e.g. Lash FX, London Lash, SL Lashes, Sugarlash...',
  BROWS:      'e.g. Brow Code, HD Brows, Everlasting Brows, henna...',
  MUA:        'e.g. Charlotte Tilbury, MAC, NARS, Huda Beauty...',
  AESTHETICS: 'e.g. Dermalogica, ZO Skin Health, Environ, Obagi...',
  OTHER:      PRODUCTS_PLACEHOLDER_DEFAULT,
};

/** Style-aesthetic options for a category, falling back to the generic list. */
export function styleAestheticOptions(serviceCategory: string | null | undefined): string[] {
  return (serviceCategory ? STYLE_AESTHETIC_MAP[serviceCategory] : undefined) ?? STYLE_OPTS;
}

/** Products placeholder for a category, falling back to the generic hint. */
export function productsPlaceholder(serviceCategory: string | null | undefined): string {
  return (serviceCategory ? PRODUCTS_PLACEHOLDER_MAP[serviceCategory] : undefined) ?? PRODUCTS_PLACEHOLDER_DEFAULT;
}
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

// The per-service buffer override in the service editor, derived from
// BUFFER_OPTS so a service can never be given a padding the account-level
// setting doesn't offer — the two used to disagree, because the service editor
// took free-typed minutes.
//
// The two directions are NOT symmetrical, and the '' option is why:
// services.buffer_before_mins / buffer_after_mins are nullable, and NULL means
// "no override". A NULL *before* resolves to 0, so for that field "no
// override" and "none" are the same state and there's only one chip for it. A
// NULL *after* inherits providers.buffer_mins, so that field needs both — one
// chip to follow the account default, and a separate '0' to say this service
// specifically needs no gap after it. See bufferFromRow() in AvailabilityService.
export const SERVICE_BUFFER_BEFORE_OPTS = [
  { value: '', label: 'None' },
  ...BUFFER_OPTS.filter(opt => opt.value !== '0'),
];

export const SERVICE_BUFFER_AFTER_OPTS = [
  { value: '', label: 'My default' },
  ...BUFFER_OPTS,
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

// The union itself is declared once, alongside the DB enum it mirrors, in
// types/database.ts. Re-exported here so the screens that already pull their
// business-type options from this module need no second import — there is
// still only one declaration of it.
export type { BusinessType };

export type AddressReleasePolicy =
  | 'always' | 'on_confirmation' | 'day_before' | 'two_days_before'
  | 'three_days_before' | 'five_days_before' | 'week_before' | 'manual';

/** Whose address the appointment happens at. */
export type AppointmentVenue = 'provider' | 'client';

/**
 * Everything that distinguishes one business type from another, in one table.
 *
 * `label` used to be copy-pasted into five places (SignUpStep4Screen,
 * InfoRegScreen, HomeScreen's and SearchScreen's filter rows, and
 * profilePresentation's BUSINESS_TYPE_LABELS), so the same DB value could and
 * did read differently depending on which screen you were looking at. `venue`
 * is the load-bearing field: it is the difference between showing the client
 * somewhere to travel to and asking them for their own address, and it was
 * previously expressed only as scattered `=== 'mobile'` comparisons.
 *
 * Record<BusinessType, …> is deliberate — add a fifth type to the union in
 * types/database.ts and this table stops compiling until it's described here.
 */
export const BUSINESS_TYPE_META: Record<BusinessType, {
  label: string;
  /** Provider-facing explanation, shown when picking the type. */
  sub: string;
  venue: AppointmentVenue;
  /** How a client should be told where this booking happens. */
  clientVenueLabel: string;
}> = {
  salon:      { label: 'Salon',       sub: 'Clients come to a commercial salon premises.',                                                       venue: 'provider', clientVenueLabel: 'You travel to the salon' },
  studio:     { label: 'Studio',      sub: 'Clients come to a dedicated studio space.',                                                          venue: 'provider', clientVenueLabel: 'You travel to the studio' },
  home_based: { label: 'Home Studio', sub: 'Clients come to your home — address stays private until you release it.',                            venue: 'provider', clientVenueLabel: 'You travel to the provider’s home studio' },
  mobile:     { label: 'Mobile',      sub: 'You travel to the client. Your address is never sent automatically — only if you send it yourself.', venue: 'client',   clientVenueLabel: 'The provider travels to you' },
};

export const BUSINESS_TYPE_OPTS: { value: BusinessType; label: string; sub: string }[] =
  (Object.keys(BUSINESS_TYPE_META) as BusinessType[]).map(value => ({
    value,
    label: BUSINESS_TYPE_META[value].label,
    sub: BUSINESS_TYPE_META[value].sub,
  }));

/**
 * Display label for a type, including the "never answered" case. Accepts the
 * empty string as well as null: the registration form models an unanswered
 * picker as '', so every caller would otherwise need its own cast.
 */
export function businessTypeLabel(type: BusinessType | null | undefined | ''): string {
  return type ? BUSINESS_TYPE_META[type].label : 'Not set';
}

/**
 * Whose address a booking with this provider happens at.
 *
 * Returns null for an unset type rather than guessing. A provider who has
 * never answered has no defined venue, and defaulting them to 'provider'
 * would show clients an address to travel to for someone who may well be
 * mobile. Callers decide how to degrade — see isMobileBooking, which falls
 * back to whether a client address is actually present.
 */
export function appointmentVenue(type: BusinessType | null | undefined): AppointmentVenue | null {
  // Indexed defensively, not with a bare BUSINESS_TYPE_META[type]: callers pass
  // raw column values (see isMobileBooking), and a legacy or hand-edited row
  // holding something outside the union would otherwise read `.venue` off
  // undefined and crash the render rather than falling back to "unknown".
  const meta = type ? BUSINESS_TYPE_META[type] : undefined;
  return meta?.venue ?? null;
}

/** The provider travels to the client — true for mobile only. */
export function providerTravelsToClient(type: BusinessType | null | undefined): boolean {
  return appointmentVenue(type) === 'client';
}

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

/** How far before opening / after closing a provider will let clients ASK for
 *  a time (providers.request_window_before_mins / _after_mins).
 *
 *  'any' — stored as NULL — is the default and is a real answer, not an
 *  absence of one: a bridal specialist takes 4am calls, and any ceiling the
 *  app picks for them is a ceiling derived from hours that describe their
 *  NORMAL week. The provider approves every request either way; this only
 *  decides how much of the day is worth showing. */
export const REQUEST_WINDOW_OPTS = [
  { value: 'any', label: 'Any time' },
  { value: '60',  label: '1 hr'   },
  { value: '120', label: '2 hrs'  },
  { value: '180', label: '3 hrs'  },
  { value: '240', label: '4 hrs'  },
  { value: '360', label: '6 hrs'  },
];

// ── Display text ────────────────────────────────────────────────────────────
// The English labels above are what gets stored and what signup (which stays
// English) shows, so they never change. Screens show them through
// optionText / localizeOptions, which look each one up here. Specialities,
// style aesthetics, languages and the patch-test options (health) aren't
// listed, so they show as written.

const OPTION_TEXT_KEYS: Readonly<Record<string, TranslationKey>> = {
  "Women": 'providerProfile.opt.women',
  "Straight": 'providerProfile.opt.hair.straight',
  "Wavy": 'providerProfile.opt.hair.wavy',
  "Curly": 'providerProfile.opt.hair.curly',
  "Coily": 'providerProfile.opt.hair.coily',
  "Men": 'providerProfile.opt.men',
  "Children": 'providerProfile.opt.children',
  "Seniors": 'providerProfile.opt.seniors',
  "Bridal & wedding parties": 'providerProfile.opt.bridalParties',
  "All welcome": 'providerProfile.opt.allWelcome',
  "Weekday mornings": 'providerProfile.opt.weekdayMornings',
  "Weekday afternoons": 'providerProfile.opt.weekdayAfternoons',
  "Weekday evenings": 'providerProfile.opt.weekdayEvenings',
  "Saturdays": 'providerProfile.opt.saturdays',
  "Sundays": 'providerProfile.opt.sundays',
  "Same-day bookings": 'providerProfile.opt.sameDay',
  "Wheelchair accessible": 'providerProfile.opt.wheelchair',
  "Parking available": 'providerProfile.opt.parking',
  "Ground floor access": 'providerProfile.opt.groundFloor',
  "Home visits for mobility": 'providerProfile.opt.homeVisits',
  "Step-free entrance": 'providerProfile.opt.stepFree',
  "£  · Great value": 'providerProfile.opt.price.budget',
  "££  · Mid-range": 'providerProfile.opt.price.mid',
  "£££  · Premium": 'providerProfile.opt.price.premium',
  "££££  · Luxury": 'providerProfile.opt.price.luxury',
  "Just me": 'providerProfile.opt.team.solo',
  "2–5 people": 'providerProfile.opt.team.small',
  "6+ people": 'providerProfile.opt.team.large',
  "Card": 'providerProfile.opt.pay.card',
  "Cash": 'providerProfile.opt.pay.cash',
  "Bank transfer": 'providerProfile.opt.pay.bank',
  "Yes, open to new clients": 'providerProfile.opt.newClients.yes',
  "Waitlist only": 'providerProfile.opt.newClients.waitlist',
  "Not currently taking new clients": 'providerProfile.opt.newClients.no',
  "None": 'providerProfile.opt.none',
  "10 min": 'providerProfile.opt.min10',
  "15 min": 'providerProfile.opt.min15',
  "30 min": 'providerProfile.opt.min30',
  "45 min": 'providerProfile.opt.min45',
  "1 hr": 'providerProfile.opt.hr1',
  "2 hrs": 'providerProfile.opt.hr2',
  "3 hrs": 'providerProfile.opt.hr3',
  "4 hrs": 'providerProfile.opt.hr4',
  "6 hrs": 'providerProfile.opt.hr6',
  "12 hrs": 'providerProfile.opt.hr12',
  "24 hrs": 'providerProfile.opt.hr24',
  "My default": 'providerProfile.opt.myDefault',
  "Every 15 min": 'providerProfile.opt.every15',
  "Every 30 min": 'providerProfile.opt.every30',
  "Every hour": 'providerProfile.opt.everyHour',
  "2 weeks": 'providerProfile.opt.weeks2',
  "1 month": 'providerProfile.opt.month1',
  "2 months": 'providerProfile.opt.months2',
  "3 months": 'providerProfile.opt.months3',
  "6 months": 'providerProfile.opt.months6',
  "Any time": 'providerProfile.opt.anyTime',
  "Unlimited": 'providerProfile.opt.unlimited',
  "Hair": 'providerProfile.opt.cat.hair',
  "Nails": 'providerProfile.opt.cat.nails',
  "Lashes": 'providerProfile.opt.cat.lashes',
  "Brows": 'providerProfile.opt.cat.brows',
  "Makeup": 'providerProfile.opt.cat.makeup',
  "Aesthetics": 'providerProfile.opt.cat.aesthetics',
  "Other": 'providerProfile.opt.cat.somethingElse',
  "Cuts, colour, braids, extensions, styling": 'providerProfile.opt.cat.hairSub',
  "Manicures, pedicures, extensions, nail art": 'providerProfile.opt.cat.nailsSub',
  "Extensions, lifts, tints": 'providerProfile.opt.cat.lashesSub',
  "Shaping, lamination, microblading, tinting": 'providerProfile.opt.cat.browsSub',
  "Bridal, occasion, editorial, SFX": 'providerProfile.opt.cat.makeupSub',
  "Facials, peels, microneedling, injectables": 'providerProfile.opt.cat.aestheticsSub',
  "Massage, waxing, tanning, holistic therapies": 'providerProfile.opt.cat.otherSub',
  "Salon": 'providerProfile.opt.bt.salon',
  "Studio": 'providerProfile.opt.bt.studio',
  "Home Studio": 'providerProfile.opt.bt.homeBased',
  "Mobile": 'providerProfile.opt.bt.mobile',
  "Clients come to a commercial salon premises.": 'providerProfile.opt.bt.salonSub',
  "Clients come to a dedicated studio space.": 'providerProfile.opt.bt.studioSub',
  "Clients come to your home — address stays private until you release it.": 'providerProfile.opt.bt.homeBasedSub',
  "You travel to the client. Your address is never sent automatically — only if you send it yourself.": 'providerProfile.opt.bt.mobileSub',
  "Not set": 'providerProfile.opt.notSet',
  "Always visible": 'providerProfile.opt.release.always',
  "On confirmation": 'providerProfile.opt.release.onConfirmation',
  "24h before": 'providerProfile.opt.release.dayBefore',
  "48h before": 'providerProfile.opt.release.twoDays',
  "72h before": 'providerProfile.opt.release.threeDays',
  "5 days before": 'providerProfile.opt.release.fiveDays',
  "1 week before": 'providerProfile.opt.release.week',
  "Manual release": 'providerProfile.opt.release.manual',
  "Your address is always visible to booked clients.": 'providerProfile.opt.release.alwaysSub',
  "Shared automatically when the booking is confirmed.": 'providerProfile.opt.release.onConfirmationSub',
  "Shared automatically 24 hours before the appointment.": 'providerProfile.opt.release.dayBeforeSub',
  "Shared automatically 48 hours before the appointment.": 'providerProfile.opt.release.twoDaysSub',
  "Shared automatically 72 hours before the appointment.": 'providerProfile.opt.release.threeDaysSub',
  "Shared automatically 5 days before the appointment.": 'providerProfile.opt.release.fiveDaysSub',
  "Shared automatically 1 week before the appointment.": 'providerProfile.opt.release.weekSub',
  "Nothing is sent automatically — you send your address per booking from that booking’s detail page.": 'providerProfile.opt.release.manualSub',
};

/** An option label or sub-line in the app language (as written if unlisted). */
export function optionText(text: string, t: (key: TranslationKey) => string): string {
  const key = OPTION_TEXT_KEYS[text];
  return key ? t(key) : text;
}

/** The same options with their label and sub-line in the app language. */
export function localizeOptions<T extends { label: string; sub?: string }>(
  opts: readonly T[],
  t: (key: TranslationKey) => string,
): T[] {
  return opts.map(o => ({ ...o, label: optionText(o.label, t), ...(o.sub ? { sub: optionText(o.sub, t) } : {}) }));
}
