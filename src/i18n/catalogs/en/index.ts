// English UI catalog — the SOURCE OF TRUTH for every translation key.
//
// The catalog is split into AREAS (one file per part of the app) so separate
// pieces of work never edit the same file. Every language folder mirrors this
// one: es/fr/pl/de each have the same area files, typed against the English
// area so an unknown key is a compile error.
//
// Conventions:
// - Keys are flat and dot-namespaced by screen: 'cart.summary.total'. A key
//   lives in exactly one area (the coverage test rejects duplicates).
// - `{param}` tokens are interpolated at resolve time. Every translation must
//   keep the same tokens as the English (the coverage test checks this).
// - Plurals: declare `x.one` and `x.other` (both with `{count}`) and call
//   `tp('x', count)`. Polish may add `x.few` and `x.many`. Never branch on
//   `count === 1` in a screen — French and Polish don't split that way.
// - Legal, refund/cancellation, payment-terms, age and health-safety copy is
//   HELD IN ENGLISH: list the key in its area's `<area>Held` array. Held keys
//   are left out of the other languages, and the resolver returns English
//   for them regardless.
// - Sign-in, sign-up and the welcome screen are deliberately English-only
//   (src/screens/auth/*), so there is no auth area.
// - Provider-written content (bios, service names, notes) never goes in a
//   catalog — see src/services/dynamicTranslationService.ts.
// - Values the app stores or matches on (DB enums, category names used in
//   queries, day names Becca parses) are not display copy: translate their
//   LABEL at render time, never the value itself.

import { common, commonHeld } from './common';
import { settings, settingsHeld } from './settings';
import { beauty, beautyHeld } from './beauty';
import { discover, discoverHeld } from './discover';
import { clientBooking, clientBookingHeld } from './clientBooking';
import { cart, cartHeld } from './cart';
import { clientAccount, clientAccountHeld } from './clientAccount';
import { providerSetup, providerSetupHeld } from './providerSetup';
import { providerProfile, providerProfileHeld } from './providerProfile';
import { providerBookings, providerBookingsHeld } from './providerBookings';
import { providerBusiness, providerBusinessHeld } from './providerBusiness';
import { shared, sharedHeld } from './shared';

/** Every area, by name. The coverage test walks this to check each area on
 *  its own (duplicates across areas, missing translations per area). */
export const EN_AREAS = {
  common,
  settings,
  beauty,
  discover,
  clientBooking,
  cart,
  clientAccount,
  providerSetup,
  providerProfile,
  providerBookings,
  providerBusiness,
  shared,
} as const;

export type AreaName = keyof typeof EN_AREAS;

export const en = {
  ...common,
  ...settings,
  ...beauty,
  ...discover,
  ...clientBooking,
  ...cart,
  ...clientAccount,
  ...providerSetup,
  ...providerProfile,
  ...providerBookings,
  ...providerBusiness,
  ...shared,
} as const;

/** Every held key across all areas. */
export const HELD_KEYS: readonly (keyof typeof en)[] = [
  ...commonHeld,
  ...settingsHeld,
  ...beautyHeld,
  ...discoverHeld,
  ...clientBookingHeld,
  ...cartHeld,
  ...clientAccountHeld,
  ...providerSetupHeld,
  ...providerProfileHeld,
  ...providerBookingsHeld,
  ...providerBusinessHeld,
  ...sharedHeld,
];
