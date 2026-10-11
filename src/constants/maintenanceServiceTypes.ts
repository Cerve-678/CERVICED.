// src/constants/maintenanceServiceTypes.ts
//
// The bookable service types Beauty Maintenance knows how to remind about, and
// ONE neutral starting interval for each. The client can change any interval
// on any item; these are only where a new item starts.
//
// Deliberate limits (legal-flagger mitigations, 2026-10-10):
//  - One interval per service type. Nothing in the client's Beauty Profile
//    (hair type, treatment history, skin type...) ever changes the LENGTH of an
//    interval. The profile only decides WHICH types are offered — see
//    src/utils/maintenanceSuggestions.ts.
//  - Skin tone is not read anywhere in this feature.
//  - Bookable services only. No at-home routines, no product restock.
//  - No injectables or other AESTHETICS treatments except facials: a repeat
//    interval for those is a clinical judgement the app must not make.
//
// THIS TABLE IS MIRRORED IN SQL. The completion trigger has to choose an
// interval server-side, so `public.maintenance_service_types` is seeded with
// exactly these rows in
// supabase/migrations/20261010120000_beauty_maintenance.sql.
// src/tests/maintenanceServiceTypes.test.ts parses that seed and fails if the
// two copies ever disagree. Change both, in the same commit.

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
  | 'gel_nails'
  | 'acrylic_infill'
  | 'nails_general'
  | 'lash_infill'
  | 'lashes_general'
  | 'brows_general'
  | 'facial';

export interface MaintenanceServiceType {
  key: MaintenanceTypeKey;
  /** What the client sees on a suggestion or a client-added item. A
   *  booking-made item shows the booked service's own name instead. */
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
  { key: 'gel_nails',         label: 'Gel nails',            searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: ['gel', 'biab', 'builder'] },
  { key: 'acrylic_infill',    label: 'Acrylic infill',       searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: ['acrylic', 'infill', 'full set'] },
  { key: 'nails_general',     label: 'Nail appointment',     searchCategory: 'NAILS',      defaultWeeks: 3,  keywords: [] },
  { key: 'lash_infill',       label: 'Lash infill',          searchCategory: 'LASHES',     defaultWeeks: 3,  keywords: ['infill', 'fill'] },
  { key: 'lashes_general',    label: 'Lash appointment',     searchCategory: 'LASHES',     defaultWeeks: 3,  keywords: [] },
  { key: 'brows_general',     label: 'Brow appointment',     searchCategory: 'BROWS',      defaultWeeks: 4,  keywords: [] },
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

/** Shortest and longest interval the steppers allow, in weeks. Mirrored by the
 *  CHECK constraint on maintenance_items.repeat_weeks. */
export const MAINTENANCE_MIN_WEEKS = 1;
export const MAINTENANCE_MAX_WEEKS = 52;
