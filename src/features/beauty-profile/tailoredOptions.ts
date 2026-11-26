// src/features/beauty-profile/tailoredOptions.ts
//
// The Beauty Profile follows the client's own answers (owner, 2026-11-17: "if
// they select 4C for their hair the rest of the questions and options need to
// tie in and make sense"). For each question that depends on an earlier one,
// this says which options suit what they've already told us and why, so the
// editor can show those first under "Suited to your 4C hair".
//
// Nothing is ever hidden: every option is still there under the suited ones,
// and an answer already saved always shows. The rules are plain lookups from
// one answer to the options it points to, not guesses: hair type → scalp,
// treatment history and goals; skin type → concerns and makeup finish; lash
// status → lash style; brow condition → brow style; nail length → shape;
// style vibe → eye and lip looks.

import type { BeautyData } from '../../types/beautyProfile';
import {
  BROW_STYLES, LASH_STYLES, MAKEUP_EYES, MAKEUP_FINISH, MAKEUP_LIPS, NAIL_COLOURS, NAIL_LENGTHS, NAIL_SERVICES, NAIL_SHAPES,
  SCALP_CONDITIONS, SKIN_CONCERNS, TREATMENT_HISTORY, hairGoalsFor, HAIR_GOALS,
} from './options';

export type TailoredQuestion =
  | 'scalpCondition' | 'treatmentHistory' | 'hairGoals' | 'skinConcerns' | 'lashStyle'
  | 'browStyle' | 'nailService' | 'nailLength' | 'nailShape' | 'nailColours'
  | 'makeupFinish' | 'makeupEyes' | 'makeupLips';

export interface TailoredOptions {
  /** The options that fit their earlier answers, in the order to show them. */
  suited: string[];
  /** Everything else, in the usual order. */
  rest: string[];
  /** What the suited ones are suited to ("your 4C hair"), or null when nothing earlier applies. */
  because: string | null;
}

const COILY = new Set(['Coily', '4A', '4B', '4C']);

type HairFamily = 'coily' | 'curly' | 'smooth';

function hairFamily(types: readonly string[]): HairFamily | null {
  if (types.some(t => COILY.has(t))) return 'coily';
  if (types.includes('Curly')) return 'curly';
  if (types.some(t => t === 'Straight' || t === 'Wavy')) return 'smooth';
  return null;
}

/** "your 4C hair", "your 4B & 4C hair", "your curly hair". */
function hairBecause(types: readonly string[]): string {
  const named = types.map(t => (/^\d/.test(t) ? t : t.toLowerCase()));
  return `your ${named.join(' & ')} hair`;
}

const SCALP_BY_HAIR: Record<HairFamily, string[]> = {
  coily: ['Dry', 'Itchy', 'Product build-up', 'Thinning edges', 'Tension from styles', 'Flaky'],
  curly: ['Dry', 'Itchy', 'Product build-up', 'Flaky', 'Dandruff'],
  smooth: ['Oily', 'Flaky', 'Sensitive', 'Dandruff'],
};

const TREATMENT_BY_HAIR: Record<HairFamily, string[]> = {
  coily: [
    'Natural (never relaxed)', 'Relaxed / permed', 'Texturised', 'Silk pressed',
    'Braids / twists', 'Wigs / units', 'Locs', 'Coloured',
  ],
  curly: ['Natural (never relaxed)', 'Coloured', 'Bleached / lightened', 'Silk pressed', 'Keratin / smoothing', 'Braids / twists', 'Henna'],
  smooth: ['Virgin hair', 'Coloured', 'Bleached / lightened', 'Box dye at home', 'Keratin / smoothing', 'Hair extensions', 'Bond repair treatment'],
};

const CONCERNS_BY_SKIN: Record<string, string[]> = {
  Oily: ['Acne prone', 'Oiliness', 'Enlarged pores', 'Hyperpigmentation', 'Blackheads', 'Acne scarring'],
  Dry: ['Dry patches', 'Dullness', 'Fine lines', 'Eczema'],
  Combination: ['Oiliness', 'Dry patches', 'Enlarged pores', 'Dullness', 'Blackheads'],
  Sensitive: ['Redness', 'Rosacea', 'Eczema', 'Ingrown hairs'],
  Normal: ['Fine lines', 'Dark circles', 'Dullness'],
  Dehydrated: ['Dullness', 'Fine lines', 'Uneven texture', 'Dry patches'],
  Mature: ['Fine lines', 'Loss of firmness', 'Sun damage', 'Hyperpigmentation', 'Dullness'],
};

const FINISH_BY_SKIN: Record<string, string[]> = {
  Oily: ['Matte', 'Soft matte', 'Satin'],
  Combination: ['Soft matte', 'Satin'],
  Dry: ['Dewy', 'Glowy', 'Satin'],
  Dehydrated: ['Dewy', 'Skin-like', 'Satin'],
  Mature: ['Satin', 'Skin-like', 'Dewy'],
};

const LASHES_BY_STATUS: Record<string, { suited: string[]; because: string }> = {
  'No extensions': { suited: ['Lifted natural lashes', 'Natural', 'Classic', 'Wispy'], because: 'your natural lashes' },
  'Lash lift & tint': { suited: ['Lifted natural lashes', 'Natural', 'Classic'], because: 'your lash lift' },
  'Growing out': { suited: ['Lifted natural lashes', 'Natural', 'Classic'], because: 'growing out your extensions' },
  'Currently have extensions': { suited: ['Classic', 'Hybrid', 'Wispy', 'Russian volume', 'Wet look'], because: 'your extensions' },
  'Wear strip lashes': { suited: ['Wispy', 'Dramatic', 'Cat eye', 'Hybrid'], because: 'wearing strip lashes' },
  'Lash tint only': { suited: ['Lifted natural lashes', 'Natural', 'Classic'], because: 'your tinted lashes' },
  'Extensions for events': { suited: ['Classic', 'Wispy', 'Hybrid', 'Dramatic', 'Fox eye'], because: 'extensions for events' },
};

const BROWS_BY_CONDITION: Record<string, string[]> = {
  Sparse: ['Ombré / powder', 'Microbladed', 'Laminated', 'Fluffy'],
  'Light / barely there': ['Ombré / powder', 'Microbladed', 'Defined'],
  Overplucked: ['Ombré / powder', 'Microbladed', 'Soft arch'],
  Uneven: ['Defined', 'Soft arch', 'Ombré / powder'],
  Unruly: ['Laminated', 'Fluffy', 'Feathered', 'Defined'],
  Full: ['Natural', 'Fluffy', 'Laminated', 'Soft arch'],
  Thinning: ['Ombré / powder', 'Microbladed', 'Hybrid (powder & strokes)', 'Henna brows', 'Tinted'],
  'Grey / white hairs': ['Tinted', 'Henna brows', 'Defined'],
  'Old tattoo / fading PMU': ['Ombré / powder', 'Hybrid (powder & strokes)', 'Natural'],
};

const SHAPES_BY_LENGTH: Record<string, string[]> = {
  'Natural / bare': ['Round', 'Squoval', 'Oval'],
  Short: ['Round', 'Squoval', 'Oval', 'Square'],
  Medium: ['Almond', 'Oval', 'Squoval', 'Square', 'Coffin'],
  Long: ['Almond', 'Coffin', 'Ballerina', 'Stiletto', 'Lipstick'],
  'Extra long': ['Coffin', 'Stiletto', 'Ballerina', 'Flare', 'Edge'],
};

const SERVICES_BY_CONDITION: Record<string, string[]> = {
  'Weak / peeling': ['BIAB / builder gel', 'Natural manicure', 'Gel polish'],
  'Brittle / break easily': ['BIAB / builder gel', 'Natural manicure', 'Hard gel'],
  Bitten: ['BIAB / builder gel', 'Natural manicure', 'Gel polish'],
  Ridged: ['BIAB / builder gel', 'Gel polish', 'Natural manicure'],
  'Short nail beds': ['Gel extensions (Gel-X)', 'Acrylic', 'BIAB / builder gel', 'Press-ons'],
  'Damaged from extensions': ['Natural manicure', 'BIAB / builder gel'],
  'Strong & healthy': ['Gel polish', 'BIAB / builder gel', 'Natural manicure'],
  'Thin / bendy': ['BIAB / builder gel', 'Hard gel', 'Japanese manicure'],
  Splitting: ['BIAB / builder gel', 'Japanese manicure', 'Natural manicure'],
  'Dry cuticles': ['Russian manicure', 'Natural manicure', 'Japanese manicure'],
  'Wide nail beds': ['Gel extensions (Gel-X)', 'Polygel', 'Gel polish'],
};

const LENGTHS_BY_SERVICE: Record<string, string[]> = {
  'Natural manicure': ['Natural / bare', 'Short'],
  'Gel polish': ['Short', 'Medium'],
  'BIAB / builder gel': ['Short', 'Medium'],
  'Hard gel': ['Medium', 'Long'],
  Acrylic: ['Medium', 'Long', 'Extra long'],
  'Gel extensions (Gel-X)': ['Medium', 'Long', 'Extra long'],
  'Press-ons': ['Medium', 'Long'],
  Polygel: ['Short', 'Medium', 'Long'],
  'Dip powder': ['Short', 'Medium'],
  'Russian manicure': ['Natural / bare', 'Short', 'Medium'],
  'Japanese manicure': ['Natural / bare', 'Short'],
};

const NAIL_COLOURS_BY_VIBE: Record<string, string[]> = {
  Natural: ['Nudes', 'Milky white', 'Pinks'],
  'Low-maintenance': ['Nudes', 'Milky white'],
  Classic: ['Reds', 'Nudes', 'Milky white'],
  Glam: ['Reds', 'Darks', 'Nudes'],
  Bold: ['Brights / neons', 'Reds', 'Darks'],
  Editorial: ['Darks', 'Brights / neons'],
  Experimental: ['Brights / neons', 'Pastels', 'Seasonal'],
  Polished: ['Nudes', 'Milky white', 'Reds'],
  Romantic: ['Pinks', 'Milky white', 'Pastels'],
  Edgy: ['Black & white', 'Darks', 'Metallics'],
  Sporty: ['Nudes', 'Milky white', 'Brights / neons'],
  Effortless: ['Nudes', 'Browns / earthy', 'Milky white'],
};

const EYES_BY_VIBE: Record<string, string[]> = {
  Natural: ['Subtle', 'Defined'],
  'Low-maintenance': ['Subtle', 'Defined'],
  Classic: ['Defined', 'Subtle', 'Smoky'],
  Glam: ['Smoky', 'Cut crease', 'Glitter / sparkle'],
  Bold: ['Bold / dramatic', 'Graphic liner', 'Cut crease'],
  Editorial: ['Graphic liner', 'Bold / dramatic', 'Glitter / sparkle'],
  Experimental: ['Graphic liner', 'Glitter / sparkle', 'Bold / dramatic'],
  Polished: ['Defined', 'Winged liner', 'Soft brown'],
  Romantic: ['Soft brown', 'Subtle', 'Glitter / sparkle'],
  Edgy: ['Smoky', 'Graphic liner', 'Siren eyes'],
  Sporty: ['Subtle', 'Soft brown'],
  Effortless: ['Subtle', 'Soft brown', 'Defined'],
};

const LIPS_BY_VIBE: Record<string, string[]> = {
  Natural: ['Nude', 'Gloss'],
  'Low-maintenance': ['Nude', 'Gloss'],
  Classic: ['Classic red', 'Nude'],
  Glam: ['Brown / 90s liner', 'Berry / wine', 'Classic red'],
  Bold: ['Bold colour', 'Classic red', 'Berry / wine'],
  Editorial: ['Bold colour', 'Berry / wine'],
  Experimental: ['Bold colour', 'Coral / peach'],
  Polished: ['Nude', 'Classic red', 'Brown / 90s liner'],
  Romantic: ['Pinks', 'Gloss', 'Blurred / ombré'],
  Edgy: ['Dark / vampy', 'Berry / wine', 'Brown / 90s liner'],
  Sporty: ['Lip oil / balm', 'Nude'],
  Effortless: ['Lip oil / balm', 'Nude', 'Gloss'],
};

/** The suited options from every picked answer, in pick order, no repeats. */
function fromPicks(picks: readonly string[], table: Record<string, string[]>): string[] {
  return [...new Set(picks.flatMap(p => table[p] ?? []))];
}

/** Lower-cased answers joined for a "because" line: "oily & sensitive". */
function joinLower(picks: readonly string[], keep: (p: string) => boolean): string {
  return picks.filter(keep).map(p => p.toLowerCase()).join(' & ');
}

function split(all: readonly string[], suited: readonly string[], because: string | null): TailoredOptions {
  const known = suited.filter(o => all.includes(o));
  if (known.length === 0 || !because) return { suited: [], rest: [...all], because: null };
  return { suited: known, rest: all.filter(o => !known.includes(o)), because };
}

export function tailoredOptions(question: TailoredQuestion, d: BeautyData): TailoredOptions {
  switch (question) {
    case 'scalpCondition':
    case 'treatmentHistory': {
      const family = hairFamily(d.hairType);
      if (!family) return split(question === 'scalpCondition' ? SCALP_CONDITIONS : TREATMENT_HISTORY, [], null);
      return question === 'scalpCondition'
        ? split(SCALP_CONDITIONS, SCALP_BY_HAIR[family], hairBecause(d.hairType))
        : split(TREATMENT_HISTORY, TREATMENT_BY_HAIR[family], hairBecause(d.hairType));
    }
    case 'hairGoals': {
      const family = hairFamily(d.hairType);
      if (!family) return split(HAIR_GOALS, [], null);
      // hairGoalsFor leads with the goals that fit; the first five are the suited ones.
      return split(HAIR_GOALS, hairGoalsFor(d.hairType).slice(0, 5), hairBecause(d.hairType));
    }
    case 'skinConcerns': {
      const suited = fromPicks(d.skinType, CONCERNS_BY_SKIN);
      return split(SKIN_CONCERNS, suited, suited.length ? `your ${joinLower(d.skinType, p => p in CONCERNS_BY_SKIN)} skin` : null);
    }
    case 'makeupFinish': {
      const suited = fromPicks(d.skinType, FINISH_BY_SKIN);
      return split(MAKEUP_FINISH, suited, suited.length ? `your ${joinLower(d.skinType, p => p in FINISH_BY_SKIN)} skin` : null);
    }
    case 'lashStyle': {
      const rule = LASHES_BY_STATUS[d.lashStatus];
      return split(LASH_STYLES, rule?.suited ?? [], rule?.because ?? null);
    }
    case 'browStyle': {
      const suited = fromPicks(d.browCondition, BROWS_BY_CONDITION);
      return split(BROW_STYLES, suited, suited.length ? `${joinLower(d.browCondition, p => p in BROWS_BY_CONDITION).replace(' / barely there', '')} brows` : null);
    }
    case 'nailService': {
      const suited = fromPicks(d.nailCondition, SERVICES_BY_CONDITION);
      const named = joinLower(d.nailCondition, p => p in SERVICES_BY_CONDITION)
        .replace(' / peeling', '').replace(' / break easily', '').replace('strong & healthy', 'healthy');
      return split(NAIL_SERVICES, suited, suited.length ? `your ${named} nails` : null);
    }
    case 'nailLength': {
      const suited = fromPicks(d.nailService, LENGTHS_BY_SERVICE);
      const service = d.nailService.find(p => p in LENGTHS_BY_SERVICE);
      return split(NAIL_LENGTHS, suited, suited.length && service ? service.replace(' (Gel-X)', '').replace(' / builder gel', '') : null);
    }
    case 'nailColours': {
      const suited = fromPicks(d.styleVibe, NAIL_COLOURS_BY_VIBE);
      return split(NAIL_COLOURS, suited, suited.length ? `your ${joinLower(d.styleVibe, p => p in NAIL_COLOURS_BY_VIBE)} style` : null);
    }
    case 'nailShape': {
      const suited = fromPicks(d.nailLength, SHAPES_BY_LENGTH);
      const named = joinLower(d.nailLength, p => p in SHAPES_BY_LENGTH).replace('natural / bare', 'natural');
      return split(NAIL_SHAPES, suited, suited.length ? `${named} nails` : null);
    }
    case 'makeupEyes':
    case 'makeupLips': {
      const table = question === 'makeupEyes' ? EYES_BY_VIBE : LIPS_BY_VIBE;
      const suited = fromPicks(d.styleVibe, table);
      return split(
        question === 'makeupEyes' ? MAKEUP_EYES : MAKEUP_LIPS,
        suited,
        suited.length ? `your ${joinLower(d.styleVibe, p => p in table)} style` : null,
      );
    }
  }
}
