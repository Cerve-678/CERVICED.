// src/utils/beautyProfileStats.ts
//
// Pure derivation of the Beauty Profile's completeness stats. Every number the
// screen displays comes from here — nothing is stored, nothing is estimated,
// and nothing is invented. Kept out of the screen component so the same counts
// (per-category %, fields set, selection totals) can be read from several
// places in one render without recomputing, and so the rules below are
// testable in isolation.
//
// Two counting rules are deliberate product decisions, not implementation
// details — changing either changes what the headline number means:
//
//  1. A multi-select field counts as "set" once it has >= 1 selection. It is
//     NOT weighted by how many options were picked: requiring every allergen
//     to be ticked to reach 100% would make the headline number unreachable
//     and read as punitive rather than as progress.
//  2. Every category contributes exactly 1/9 of the overall score, regardless
//     of how many fields it holds. NAILS (2 fields) therefore counts the same
//     as SKIN (4). This is slightly generous to small categories, and is the
//     price of a headline number a user can predict as they fill it in.

import type { BeautyData, CategoryKey } from '../types/beautyProfile';

/** A single category's derived completeness. */
export interface CategoryStats {
  key: CategoryKey;
  /** Fields in this category that hold at least one value. */
  fieldsSet: number;
  /** Total fields defined for this category. */
  fieldsTotal: number;
  /** fieldsSet / fieldsTotal, 0–100, rounded. */
  percent: number;
  /** Individual values chosen across this category (multi-selects count each). */
  selections: number;
  /** True once any field in the category holds a value. */
  started: boolean;
  /** True once every field in the category holds a value. */
  complete: boolean;
}

/** Everything the screen renders, derived in one pass. */
export interface BeautyProfileStats {
  /** Mean of the nine category percentages, 0–100, rounded. */
  overallPercent: number;
  /** Categories with at least one field set. */
  categoriesStarted: number;
  /** Always 9 — surfaced so the view never hardcodes a denominator. */
  categoriesTotal: number;
  /** Every individual value chosen across the whole profile. */
  totalSelections: number;
  /** Per-category stats, keyed for direct lookup. */
  byCategory: Record<CategoryKey, CategoryStats>;
  /** Per-category stats in display order. */
  ordered: CategoryStats[];
  /** Highest-percentage category that has been started; null when none have. */
  mostComplete: CategoryStats | null;
  /** Lowest-percentage category; null only when there are no categories. */
  leastComplete: CategoryStats | null;
  /** Categories with nothing set at all. */
  untouchedCount: number;
  /** True when the profile holds no data whatsoever — drives the empty state. */
  isEmpty: boolean;
}

/**
 * A field is either a single-select string or a multi-select array. Booleans are
 * deliberately excluded from field counting: `photographyConsent` and `has_kids`
 * always hold a value (they default to true/false), so counting them would mean
 * CONSENT could never read as anything but complete, and PERSONALISATION would
 * start at a misleading non-zero.
 */
type FieldValue = string | string[];

function isSet(value: FieldValue): boolean {
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

function countSelections(value: FieldValue): number {
  if (Array.isArray(value)) return value.length;
  return value.trim().length > 0 ? 1 : 0;
}

/**
 * The fields belonging to each category, in the order the screen shows them.
 * This is the single source of truth for every denominator on the screen — the
 * view must never hardcode "4 fields", it reads `fieldsTotal` from here.
 */
const CATEGORY_FIELDS: Record<CategoryKey, ReadonlyArray<keyof BeautyData>> = {
  health:          ['allergies', 'medicalNotes'],
  skin:            ['skinType', 'skinTone', 'skinConcerns', 'sensitiveAreas'],
  hair:            ['hairType', 'scalpCondition', 'treatmentHistory', 'hairGoals'],
  nails:           ['nailLength', 'nailShape'],
  lashesBrows:     ['lashStyle', 'lashStatus', 'browStyle', 'browCondition'],
  makeup:          ['makeupCoverage', 'makeupFinish', 'makeupEyes', 'makeupLips'],
  general:         ['styleVibe', 'serviceInterests'],
  personalisation: ['gender'],
  consent:         [],
};

/** Display order for the tile grid. HEALTH & SAFETY leads deliberately. */
export const CATEGORY_ORDER: readonly CategoryKey[] = [
  'health', 'skin', 'hair', 'nails', 'lashesBrows',
  'makeup', 'general', 'personalisation', 'consent',
] as const;

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  health:          'HEALTH & SAFETY',
  skin:            'SKIN',
  hair:            'HAIR',
  nails:           'NAILS',
  lashesBrows:     'LASHES & BROWS',
  makeup:          'MAKEUP',
  general:         'GENERAL',
  personalisation: 'PERSONALISATION',
  consent:         'CONSENT',
};

function computeCategory(key: CategoryKey, data: BeautyData): CategoryStats {
  const fields = CATEGORY_FIELDS[key];

  // CONSENT holds only booleans, which are excluded from field counting (see
  // FieldValue above). It is always "on file" because its switches always carry
  // a real value, so it reports complete rather than dividing by zero.
  if (fields.length === 0) {
    return {
      key,
      fieldsSet: 0,
      fieldsTotal: 0,
      percent: 100,
      selections: 0,
      started: true,
      complete: true,
    };
  }

  let fieldsSet = 0;
  let selections = 0;

  for (const field of fields) {
    const value = data[field] as FieldValue | boolean | null;
    // gender is `string | null`; booleans are excluded by design.
    if (value === null || typeof value === 'boolean') continue;
    if (isSet(value)) fieldsSet += 1;
    selections += countSelections(value);
  }

  const fieldsTotal = fields.length;

  return {
    key,
    fieldsSet,
    fieldsTotal,
    percent: Math.round((fieldsSet / fieldsTotal) * 100),
    selections,
    started: fieldsSet > 0,
    complete: fieldsSet === fieldsTotal,
  };
}

/**
 * Derive every stat the Beauty Profile screen displays.
 *
 * Pure: same input always yields the same output, no I/O, no side effects.
 */
export function computeBeautyProfileStats(data: BeautyData): BeautyProfileStats {
  const ordered = CATEGORY_ORDER.map(key => computeCategory(key, data));

  const byCategory = ordered.reduce((acc, stats) => {
    acc[stats.key] = stats;
    return acc;
  }, {} as Record<CategoryKey, CategoryStats>);

  // CONSENT is excluded from the headline average. It is always 100% (its
  // switches always hold a value), so including it would floor the overall
  // score at ~11% for a user who has genuinely filled in nothing — exactly the
  // misleading non-zero the empty state exists to avoid.
  const scored = ordered.filter(c => c.key !== 'consent');

  const overallPercent = scored.length === 0
    ? 0
    : Math.round(scored.reduce((sum, c) => sum + c.percent, 0) / scored.length);

  const startedCategories = scored.filter(c => c.started);

  // "Most complete" is only meaningful among categories with data; ranking
  // untouched categories against each other would surface an arbitrary winner.
  const mostComplete = startedCategories.length > 0
    ? startedCategories.reduce((best, c) => (c.percent > best.percent ? c : best))
    : null;

  const leastComplete = scored.length > 0
    ? scored.reduce((worst, c) => (c.percent < worst.percent ? c : worst))
    : null;

  return {
    overallPercent,
    categoriesStarted: startedCategories.length,
    categoriesTotal: scored.length,
    totalSelections: scored.reduce((sum, c) => sum + c.selections, 0),
    byCategory,
    ordered,
    mostComplete,
    leastComplete,
    untouchedCount: scored.filter(c => !c.started).length,
    isEmpty: startedCategories.length === 0,
  };
}
