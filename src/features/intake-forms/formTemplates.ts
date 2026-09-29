import type { IntakeFormQuestion } from '../../services/databaseService';
import type { ServiceCategory } from '../../types/database';

// ── Form templates ───────────────────────────────────────────────────────────
// Templates follow the provider's service type (HAIR, NAILS, …), not whatever
// words happen to appear in their service names: a nail tech is never offered
// a Hair Consultation Form because one service is called "Acrylic extension".
// Every dedicated template below belongs to exactly one ServiceCategory, and a
// provider is only offered the templates of the types they declared. Service
// names are used afterwards, only to rank templates *within* those types.
// A provider can always build a fully custom form regardless of type.

export interface FormTemplate {
  id:        string;
  /** The service type this template is written for. null = not tied to one
   *  (policy / terms / the general fallback below). */
  category:  ServiceCategory | null;
  kind:      'consultation' | 'patchTest' | 'medicalHistory' | 'policy' | 'terms';
  label:     string;
  subtitle:  string;
  /** Ranking hints only — matched against a provider's service names to order
   *  templates inside their own type. Never a reason to offer a template. */
  keywords:  string[];
  questions: Omit<IntakeFormQuestion, 'id'>[];
}

const TEMPLATES: FormTemplate[] = [
  // ── Consultation forms (one per category — the general "what are we doing today" form) ──
  {
    id: 'hair', category: 'HAIR', kind: 'consultation', label: 'Hair Consultation Form', subtitle: 'Colour, cuts, treatments',
    keywords: ['hair', 'colour', 'color', 'cut', 'blowout', 'blow dry', 'highlight', 'balayage', 'keratin', 'relaxer', 'perm', 'toner', 'gloss', 'trim', 'extension', 'weave', 'loc', 'braids'],
    questions: [
      { type: 'choice', label: 'What is your hair type?', required: true, options: ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'] },
      { type: 'choice', label: 'Hair history', required: true, options: ['Virgin / untreated', 'Coloured', 'Bleached / lightened', 'Relaxed / permed', 'Extensions'] },
      { type: 'text',   label: 'What look are you going for today?', required: true },
      { type: 'yesno',  label: 'Any known allergies to hair products?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Any scalp conditions (dandruff, psoriasis, etc.)?', required: false },
      { type: 'yesno',  label: 'Currently pregnant or breastfeeding?', required: true },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'nails', category: 'NAILS', kind: 'consultation', label: 'Nail Consultation Form', subtitle: 'Gel, acrylic, nail art',
    keywords: ['nail', 'gel', 'acrylic', 'manicure', 'pedicure', 'infill', 'removal', 'shellac', 'sns', 'dip'],
    questions: [
      { type: 'choice', label: 'Service booked', required: true, options: ['Gel manicure', 'Acrylic set', 'Nail art', 'Pedicure', 'Infill', 'Removal'] },
      { type: 'yesno',  label: 'Any nail damage or thin nails?', required: true },
      { type: 'yesno',  label: 'Any known allergies (acrylics, gels)?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'choice', label: 'Preferred nail length', required: false, options: ['Short', 'Medium', 'Long', 'Extra long'] },
      { type: 'text',   label: 'Any inspiration or references?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'lashes', category: 'LASHES', kind: 'consultation', label: 'Lash Consultation Form', subtitle: 'Extensions, lifts, tints',
    keywords: ['lash', 'extension', 'lash lift', 'tint', 'classic set', 'hybrid', 'volume', 'mega volume'],
    questions: [
      { type: 'choice', label: 'Type of lash service', required: true, options: ['Classic set', 'Hybrid set', 'Volume set', 'Infill', 'Removal', 'Lash lift & tint'] },
      { type: 'yesno',  label: 'Had lash extensions before?', required: true },
      { type: 'yesno',  label: 'Any known allergies (latex, formaldehyde, cyanoacrylate)?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Do you wear contact lenses?', required: true },
      { type: 'choice', label: 'Desired look', required: false, options: ['Natural', 'Wispy', 'Cat eye', 'Doll eye', 'Bold / dramatic'] },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'brows', category: 'BROWS', kind: 'consultation', label: 'Brow Consultation Form', subtitle: 'Wax, thread, lamination',
    keywords: ['brow', 'eyebrow', 'thread', 'threading', 'lamination', 'microblading', 'powder brow', 'henna'],
    questions: [
      { type: 'choice', label: 'Brow service booked', required: true, options: ['Wax & tint', 'Thread & tint', 'Lamination', 'Microblading', 'Powder brows', 'Combo brows'] },
      { type: 'yesno',  label: 'Any previous brow treatments (microblading/tattoo)?', required: true },
      { type: 'yesno',  label: 'Any known skin allergies or sensitivities?', required: true },
      { type: 'text',   label: 'Please describe any skin conditions', required: false },
      { type: 'yesno',  label: 'On Roaccutane or blood-thinning medication?', required: true },
      { type: 'choice', label: 'Preferred brow style', required: false, options: ['Natural', 'Defined', 'Arched', 'Straight / Korean', 'Fluffy'] },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'skin', category: 'AESTHETICS', kind: 'consultation', label: 'Skin Consultation Form', subtitle: 'Facials, peels, aesthetics',
    keywords: ['skin', 'facial', 'peel', 'derma', 'aesthetic', 'hydra', 'microneedle', 'botox', 'filler', 'glow', 'led', 'microdermabrasion', 'hifu'],
    questions: [
      { type: 'choice', label: 'Skin type', required: true, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
      { type: 'choice', label: 'Main skin concern', required: true, options: ['Acne', 'Hyperpigmentation', 'Ageing / fine lines', 'Dehydration', 'Redness / rosacea', 'General glow'] },
      { type: 'yesno',  label: 'Any known allergies or sensitivities?', required: true },
      { type: 'text',   label: 'Please describe any allergies', required: false },
      { type: 'yesno',  label: 'Any active skin conditions (eczema, psoriasis, cold sores)?', required: true },
      { type: 'yesno',  label: 'Currently pregnant or breastfeeding?', required: true },
      { type: 'yesno',  label: 'On photosensitive medication (antibiotics, retinoids)?', required: true },
      { type: 'text',   label: 'Last professional treatment and when?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'mua', category: 'MUA', kind: 'consultation', label: 'Makeup Consultation Form', subtitle: 'Glam, bridal, editorial',
    keywords: ['makeup', 'make-up', 'mua', 'bridal', 'glam', 'foundation', 'airbrush', 'makeover'],
    questions: [
      { type: 'choice', label: 'Skin type', required: true, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
      { type: 'text',   label: 'What is the occasion?', required: true },
      { type: 'choice', label: 'Desired look', required: true, options: ['Natural / no-makeup', 'Soft glam', 'Full glam', 'Editorial', 'Bridal'] },
      { type: 'yesno',  label: 'Any known allergies to makeup products?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Do you wear contact lenses?', required: false },
      { type: 'text',   label: 'Any products you do not want used?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },

  // ── Patch test forms — only offered to categories where a patch test is
  // standard practice for the chemicals/adhesives involved. ──
  {
    id: 'patchtest-hair', category: 'HAIR', kind: 'patchTest', label: 'Patch Test Consent Form', subtitle: 'Required 48hrs before colour or chemical services',
    keywords: ['colour', 'color', 'highlight', 'balayage', 'keratin', 'relaxer', 'perm', 'toner', 'gloss', 'bleach'],
    questions: [
      { type: 'yesno', label: 'Have you had a patch test for this product within the last 6 months?', required: true },
      { type: 'text',  label: 'Date of patch test (if applicable)', required: false },
      { type: 'yesno', label: 'Any reaction at the patch test site (redness, itching, swelling)?', required: true },
      { type: 'text',  label: 'If yes, please describe', required: false },
      { type: 'yesno', label: 'Do you understand a patch test is required 48 hours before this appointment and that your appointment may be declined without one?', required: true },
    ],
  },
  {
    id: 'patchtest-lashes', category: 'LASHES', kind: 'patchTest', label: 'Patch Test Consent Form', subtitle: 'Required 48hrs before lash tint or extensions',
    keywords: ['lash', 'extension', 'tint', 'classic set', 'hybrid', 'volume'],
    questions: [
      { type: 'yesno', label: 'Have you had a patch test for lash glue/tint within the last 6 months?', required: true },
      { type: 'text',  label: 'Date of patch test (if applicable)', required: false },
      { type: 'yesno', label: 'Any reaction at the patch test site (redness, itching, swelling)?', required: true },
      { type: 'text',  label: 'If yes, please describe', required: false },
      { type: 'yesno', label: 'Do you understand a patch test is required 48 hours before this appointment and that your appointment may be declined without one?', required: true },
    ],
  },
  {
    id: 'patchtest-brows', category: 'BROWS', kind: 'patchTest', label: 'Patch Test Consent Form', subtitle: 'Required 48hrs before brow tint or henna',
    keywords: ['brow', 'eyebrow', 'henna', 'lamination', 'microblading'],
    questions: [
      { type: 'yesno', label: 'Have you had a patch test for tint/henna within the last 6 months?', required: true },
      { type: 'text',  label: 'Date of patch test (if applicable)', required: false },
      { type: 'yesno', label: 'Any reaction at the patch test site (redness, itching, swelling)?', required: true },
      { type: 'text',  label: 'If yes, please describe', required: false },
      { type: 'yesno', label: 'Do you understand a patch test is required 48 hours before this appointment and that your appointment may be declined without one?', required: true },
    ],
  },
  {
    id: 'patchtest-skin', category: 'AESTHETICS', kind: 'patchTest', label: 'Patch Test Consent Form', subtitle: 'Required before chemical peels or new product use',
    keywords: ['peel', 'derma', 'microneedle', 'hydra', 'microdermabrasion'],
    questions: [
      { type: 'yesno', label: 'Have you had a patch test for this product within the last 6 months?', required: true },
      { type: 'text',  label: 'Date of patch test (if applicable)', required: false },
      { type: 'yesno', label: 'Any reaction at the patch test site (redness, itching, swelling)?', required: true },
      { type: 'text',  label: 'If yes, please describe', required: false },
      { type: 'yesno', label: 'Do you understand a patch test is required before this treatment and that your appointment may be declined without one?', required: true },
    ],
  },

  // ── Medical history — offered to Skin/Aesthetics, where injectables, peels
  // and advanced treatments carry real medical contraindications. ──
  {
    id: 'medicalhistory-skin', category: 'AESTHETICS', kind: 'medicalHistory', label: 'Medical History Form', subtitle: 'Required before injectables, peels & advanced treatments',
    keywords: ['botox', 'filler', 'aesthetic', 'peel', 'microneedle', 'hifu'],
    questions: [
      { type: 'text',  label: 'List any medical conditions we should be aware of', required: true },
      { type: 'yesno', label: 'Are you currently taking any medications?', required: true },
      { type: 'text',  label: 'If yes, please list', required: false },
      { type: 'yesno', label: 'Any known allergies (medications, skincare ingredients, latex)?', required: true },
      { type: 'text',  label: 'If yes, please describe', required: false },
      { type: 'yesno', label: 'Are you pregnant or breastfeeding?', required: true },
      { type: 'yesno', label: 'Do you have a pacemaker or other implanted medical device?', required: true },
      { type: 'yesno', label: 'Any history of keloid scarring or skin cancer?', required: true },
      { type: 'yesno', label: 'Currently under the care of a dermatologist or doctor for a skin condition?', required: true },
    ],
  },
];

/** Offered only to a provider none of whose declared types has a dedicated
 *  template above (Other, or the legacy Male/Kids stamps) — for them the
 *  alternative was every other trade's consultation form. Deliberately
 *  generic; a provider who wants trade-specific questions builds a custom
 *  form. */
const GENERAL_TEMPLATE: FormTemplate = {
  id: 'general', category: null, kind: 'consultation', label: 'Client Consultation Form', subtitle: 'General health & preferences',
  keywords: [],
  questions: [
    { type: 'text',   label: 'What are you hoping to have done today?', required: true },
    { type: 'yesno',  label: 'Any known allergies or sensitivities?', required: true },
    { type: 'text',   label: 'If yes, please describe', required: false },
    { type: 'yesno',  label: 'Any skin conditions or injuries in the area being treated?', required: true },
    { type: 'yesno',  label: 'Are you currently taking any medication?', required: true },
    { type: 'yesno',  label: 'Currently pregnant or breastfeeding?', required: true },
    { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
  ],
};

/** The service types a provider has declared, upper-cased, headline first.
 *  `all` is providers.service_categories (a provider may run several trades);
 *  `primary` is the single providers.service_category every provider has and
 *  the only one older rows carry. */
export function declaredCategories(
  primary: string | null | undefined,
  all: readonly string[] | null | undefined,
): string[] {
  const source = all && all.length > 0 ? all : primary ? [primary] : [];
  return Array.from(new Set(source.map(c => c.toUpperCase())));
}

// A keyword counts when a word in the text starts with it ("lash" → "lashes",
// "lash lift"), not when it is buried mid-word ("led" in "called").
function mentions(text: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);
}

function scoreAgainst(tpl: FormTemplate, serviceNames: readonly string[]): number {
  const pool = serviceNames.join(' ').toLowerCase();
  return tpl.keywords.filter(k => mentions(pool, k)).length;
}

/** Every template written for the provider's declared service types — e.g. a
 *  lash artist sees the Lash Consultation Form AND the lash Patch Test Consent
 *  Form, a nail tech only the Nail Consultation Form. Templates whose keywords
 *  match the provider's own service names come first. */
export function getRelevantTemplates(
  categories: readonly string[],
  serviceNames: readonly string[],
): FormTemplate[] {
  const owned = TEMPLATES.filter(tpl => tpl.category !== null && categories.includes(tpl.category));
  if (owned.length === 0) return [GENERAL_TEMPLATE];
  return owned
    .map(tpl => ({ tpl, score: scoreAgainst(tpl, serviceNames) }))
    .sort((a, b) => b.score - a.score)
    .map(({ tpl }) => tpl);
}

/** The Consultation Form that best fits one booked service, chosen only from
 *  `pool` (the provider's relevant templates) so a booking can never suggest a
 *  form for a trade the provider doesn't practise. Patch test / medical history
 *  are deliberate picks from "Other templates", never a one-click default. */
export function detectTemplate(serviceName: string, pool: readonly FormTemplate[]): FormTemplate | null {
  let best: FormTemplate | null = null, bestScore = 0;
  for (const tpl of pool) {
    if (tpl.kind !== 'consultation') continue;
    const score = scoreAgainst(tpl, [serviceName]);
    if (score > bestScore) { bestScore = score; best = tpl; }
  }
  return bestScore > 0 ? best : null;
}
