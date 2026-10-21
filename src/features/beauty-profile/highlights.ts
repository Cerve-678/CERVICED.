// src/features/beauty-profile/highlights.ts
//
// Pure derivation of what the Beauty Card shows: each category's headline
// answer (the big word on its tile) and the smaller answers under it. The
// completeness numbers still come from src/utils/beautyProfileStats.ts; this file only
// decides which of the client's own answers lead.
//
// Skin tone is deliberately never surfaced here. It is still asked and still
// stored, but the card is the client's at-a-glance summary and the product
// decision is to avoid leading with it (see the Beauty Maintenance spec).

import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import type { BeautyProfileStats } from '../../utils/beautyProfileStats';
import { GENDER_LABELS } from './options';

/** The few display words that aren't stored answers, passed in already
 *  translated so this file stays pure. */
export interface HighlightLabels {
  scalp: (condition: string) => string;
  medicalNote: string;
  photosOn: string;
  photosOff: string;
}

export interface CategoryHighlight {
  key: CategoryKey;
  /** The headline answer, or null when the category holds nothing to show. */
  lead: string | null;
  /** The remaining answers, in field order. */
  details: string[];
}

/** The four traits on the landing card, in reading order. */
export const CARD_TRAITS: readonly CategoryKey[] = ['hair', 'skin', 'nails', 'general'] as const;

const nonEmpty = (values: (string | string[] | null | undefined)[]): string[] =>
  values.flatMap(v => (Array.isArray(v) ? v : v ? [v] : [])).map(v => v.trim()).filter(Boolean);

/** Answers for a category in priority order: the first becomes the lead. */
function orderedAnswers(key: CategoryKey, d: BeautyData, L: HighlightLabels): string[] {
  switch (key) {
    case 'hair':        return nonEmpty([d.hairType, d.scalpCondition ? L.scalp(d.scalpCondition) : '', d.hairGoals, d.treatmentHistory]);
    case 'skin':        return nonEmpty([d.skinType, d.skinConcerns, d.sensitiveAreas]);
    case 'nails':       return nonEmpty([d.nailShape, d.nailLength]);
    case 'lashesBrows': return nonEmpty([d.lashStyle, d.browStyle, d.lashStatus, d.browCondition]);
    case 'makeup':      return nonEmpty([d.makeupCoverage, d.makeupFinish, d.makeupEyes, d.makeupLips]);
    case 'general':     return nonEmpty([d.styleVibe, d.serviceInterests]);
    case 'personalisation': return nonEmpty([d.gender ? GENDER_LABELS[d.gender] : '']);
    case 'health':      return nonEmpty([d.allergies, d.medicalNotes.trim() ? L.medicalNote : '']);
    case 'consent':     return [d.photographyConsent ? L.photosOn : L.photosOff];
  }
}

export function highlightCategory(key: CategoryKey, data: BeautyData, labels: HighlightLabels): CategoryHighlight {
  const [lead = null, ...details] = orderedAnswers(key, data, labels);
  return { key, lead, details };
}

/**
 * The tile that gets the filled colour on My Profile: the started category
 * with the highest completeness, ties broken by display order. Health and
 * Consent never lead (Health has its own strip; Consent is always complete).
 * Null when nothing has been started.
 */
export function leadingCategory(
  stats: BeautyProfileStats,
  order: readonly CategoryKey[],
): CategoryKey | null {
  let best: CategoryKey | null = null;
  for (const key of order) {
    if (key === 'health' || key === 'consent') continue;
    const c = stats.byCategory[key];
    if (!c.started) continue;
    if (best === null || c.percent > stats.byCategory[best].percent) best = key;
  }
  return best;
}
