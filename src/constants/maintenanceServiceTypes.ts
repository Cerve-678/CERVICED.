// src/constants/maintenanceServiceTypes.ts
//
// The bookable service types Beauty Maintenance knows how to remind about, and
// ONE neutral starting interval for each. The client can change any interval
// on any item; these are only where a new item starts.
//
// Deliberate limits (legal-flagger mitigations, 2026-10-10; interval rule
// revised by the user 2026-10-19):
//  - One neutral default per service type. Nothing in the client's Beauty
//    Profile (hair type, treatment history, skin type...) ever changes the
//    LENGTH of an interval. The profile only decides WHICH types are offered —
//    see src/utils/maintenanceSuggestions.ts.
//  - What CAN change it, in order: an interval the client set (always wins),
//    the provider's own recommendation, then how often the client's own
//    completed bookings of the type actually were (server-side, see
//    supabase/migrations/20261019150000_maintenance_learned_intervals.sql).
//    The default applies only when none of those exists.
//  - Skin tone is not read anywhere in this feature.
//  - Bookable services only. No at-home routines, no product restock.
//  - No injectables or other AESTHETICS treatments except facials and
//    waxing: a repeat interval for those is a clinical judgement the app must
//    not make. Waxing sits in AESTHETICS only because providers have no
//    waxing category (OTHER is retired); see "A Body provider category" in
//    FUTURE_LOGIC.md.
//
// THIS TABLE IS MIRRORED IN SQL. The completion trigger has to choose an
// interval server-side, so `public.maintenance_service_types` holds exactly
// these rows, restated in full by the newest migration that seeds it
// (currently 20261019120000_maintenance_more_types_and_notes.sql).
// src/tests/maintenanceServiceTypes.test.ts parses that seed and fails if the
// two copies ever disagree. Change both, in the same commit.
//
// Order matters: within a category the completion trigger takes the first
// type whose keyword is in the booked service's name. So a type that must win
// a tie goes first ("Gel pedicure" is a pedicure, "Facial wax" is a wax).

import type { TranslationKey } from '../i18n/types';

/** Search tab codes (SearchScreen's CATEGORY_CODE_MAP values). */
export type MaintenanceSearchCategory = 'HAIR' | 'NAILS' | 'LASHES' | 'BROWS' | 'AESTHETICS';

export type MaintenanceTypeKey =
  | 'relaxer_touch_up'
  | 'root_colour'
  | 'silk_press'
  | 'wash_and_go'
  | 'deep_conditioning'
  | 'loc_retwist'
  | 'trim'
  | 'hair_general'
  | 'pedicure'
  | 'gel_nails'
  | 'acrylic_infill'
  | 'nails_general'
  | 'lash_infill'
  | 'lash_lift'
  | 'lashes_general'
  | 'brow_lamination'
  | 'brow_tint'
  | 'brows_general'
  | 'waxing'
  | 'facial';

export interface MaintenanceServiceType {
  key: MaintenanceTypeKey;
  /** What the client sees on a suggestion or a client-added item, in
   *  English (the source text). A booking-made item shows the booked
   *  service's own name instead. Shown through `maintenanceTypeLabel`. */
  label: string;
  /** Which Search tab "Find a provider" opens. */
  searchCategory: MaintenanceSearchCategory;
  /** Neutral starting interval in weeks. Editable per item. */
  defaultWeeks: number;
  /**
   * Lower-case substrings that identify a booked service as this type, tried
   * in table order within its category. An empty list marks the category's
   * catch-all, used only when nothing more specific matched. AESTHETICS has
   * no catch-all on purpose (see the header).
   */
  keywords: readonly string[];
}

export const MAINTENANCE_SERVICE_TYPES: readonly MaintenanceServiceType[] = [
  { key: 'relaxer_touch_up',  label: 'Relaxer touch-up',     searchCategory: 'HAIR',       defaultWeeks: 8,  keywords: ['relax'] },
  { key: 'root_colour',       label: 'Root colour touch-up', searchCategory: 'HAIR',       defaultWeeks: 6,  keywords: ['root', 'colour', 'color', 'highlight', 'balayage'] },
  { key: 'silk_press',        label: 'Silk press',           searchCategory: 'HAIR',       defaultWeeks: 2,  keywords: ['silk press'] },
  { key: 'wash_and_go',       label: 'Wash and go',          searchCategory: 'HAIR',       defaultWeeks: 2,  keywords: ['wash & go', 'wash and go', 'wash n go'] },
  { key: 'deep_conditioning', label: 'Deep conditioning',    searchCategory: 'HAIR',       defaultWeeks: 4,  keywords: ['deep condition', 'conditioning'] },
  { key: 'loc_retwist',       label: 'Loc retwist',          searchCategory: 'HAIR',       defaultWeeks: 6,  keywords: ['retwist', 'loc maintenance'] },
  { key: 'trim',              label: 'Trim',                 searchCategory: 'HAIR',       defaultWeeks: 12, keywords: ['trim', 'cut'] },
  { key: 'hair_general',      label: 'Hair appointment',     searchCategory: 'HAIR',       defaultWeeks: 6,  keywords: [] },
  { key: 'pedicure',          label: 'Pedicure',             searchCategory: 'NAILS',      defaultWeeks: 6,  keywords: ['pedi'] },
  { key: 'gel_nails',         label: 'Gel nails',            searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: ['gel', 'biab', 'builder'] },
  { key: 'acrylic_infill',    label: 'Acrylic infill',       searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: ['acrylic', 'infill', 'full set'] },
  { key: 'nails_general',     label: 'Nail appointment',     searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: [] },
  { key: 'lash_infill',       label: 'Lash infill',          searchCategory: 'LASHES',     defaultWeeks: 3,  keywords: ['infill', 'fill'] },
  { key: 'lash_lift',         label: 'Lash lift',            searchCategory: 'LASHES',     defaultWeeks: 6,  keywords: ['lift'] },
  { key: 'lashes_general',    label: 'Lash appointment',     searchCategory: 'LASHES',     defaultWeeks: 3,  keywords: [] },
  { key: 'brow_lamination',   label: 'Brow lamination',      searchCategory: 'BROWS',      defaultWeeks: 6,  keywords: ['lamin'] },
  { key: 'brow_tint',         label: 'Brow tint',            searchCategory: 'BROWS',      defaultWeeks: 4,  keywords: ['tint'] },
  { key: 'brows_general',     label: 'Brow appointment',     searchCategory: 'BROWS',      defaultWeeks: 4,  keywords: [] },
  { key: 'waxing',            label: 'Waxing',               searchCategory: 'AESTHETICS', defaultWeeks: 4,  keywords: ['wax'] },
  { key: 'facial',            label: 'Facial',               searchCategory: 'AESTHETICS', defaultWeeks: 6,  keywords: ['facial', 'dermaplan'] },
] as const;

const BY_KEY: ReadonlyMap<MaintenanceTypeKey, MaintenanceServiceType> = new Map(
  MAINTENANCE_SERVICE_TYPES.map(t => [t.key, t]),
);

/** Look a type up by key. Returns null for an unknown key (e.g. a row written
 *  by a newer build), so callers degrade to a generic label, never crash. */
export function getMaintenanceServiceType(key: string | null | undefined): MaintenanceServiceType | null {
  if (!key) return null;
  return BY_KEY.get(key as MaintenanceTypeKey) ?? null;
}

/** Display-label keys for each type's `label`. */
const MAINTENANCE_TYPE_LABEL_KEYS: Readonly<Record<MaintenanceTypeKey, TranslationKey>> = {
  relaxer_touch_up: 'clientAccount.maintenanceType.relaxerTouchUp',
  root_colour: 'clientAccount.maintenanceType.rootColour',
  silk_press: 'clientAccount.maintenanceType.silkPress',
  wash_and_go: 'clientAccount.maintenanceType.washAndGo',
  deep_conditioning: 'clientAccount.maintenanceType.deepConditioning',
  loc_retwist: 'clientAccount.maintenanceType.locRetwist',
  trim: 'clientAccount.maintenanceType.trim',
  hair_general: 'clientAccount.maintenanceType.hairGeneral',
  pedicure: 'clientAccount.maintenanceType.pedicure',
  gel_nails: 'clientAccount.maintenanceType.gelNails',
  acrylic_infill: 'clientAccount.maintenanceType.acrylicInfill',
  nails_general: 'clientAccount.maintenanceType.nailsGeneral',
  lash_infill: 'clientAccount.maintenanceType.lashInfill',
  lash_lift: 'clientAccount.maintenanceType.lashLift',
  lashes_general: 'clientAccount.maintenanceType.lashesGeneral',
  brow_lamination: 'clientAccount.maintenanceType.browLamination',
  brow_tint: 'clientAccount.maintenanceType.browTint',
  brows_general: 'clientAccount.maintenanceType.browsGeneral',
  waxing: 'clientAccount.maintenanceType.waxing',
  facial: 'clientAccount.maintenanceType.facial',
};

/** A type's label in the current language (pass `t` or `tr`). */
export function maintenanceTypeLabel(type: MaintenanceServiceType, t: (key: TranslationKey) => string): string {
  return t(MAINTENANCE_TYPE_LABEL_KEYS[type.key]);
}

/** Shortest and longest interval the steppers allow, in weeks. Mirrored by the
 *  CHECK constraint on maintenance_items.repeat_weeks. */
export const MAINTENANCE_MIN_WEEKS = 1;
export const MAINTENANCE_MAX_WEEKS = 52;
