// src/features/beauty-profile/suitedIdeas.ts
//
// Turns a client's Beauty Profile into the services that suit them — what
// the Beauty Profile's "Suited to you" card and Becca's "What suits me?"
// answer show. Pure: same answers in, same ideas out.
//
// The point is that the profile actually changes what's offered. A client
// with 4C hair gets silk presses, protective styles and length-retention
// care, not balayage. Colour only comes up for anyone who said they colour
// or want to, and balayage only for hair it's usually done on.
//
// What it may and may not read (same lines as maintenanceSuggestions.ts):
//  - Preference and style answers only: hair type, hair goals, colour and
//    treatment history, nails, lashes, brows, makeup, style vibe.
//  - Never skin tone, skin concerns, sensitive areas, allergies or medical
//    notes. Several of those are health conditions, and offering a
//    treatment because of one is advice, not a suggestion.
//  - No aesthetics or injectables, for the same reason.
//  - Every idea says which answer it came from.

import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import { formatPickList } from './pickList';

/** The categories that have ideas. Skin has none on purpose (see above). */
export type SuitedCategory = 'hair' | 'nails' | 'lashesBrows' | 'makeup';

export interface SuitedIdea {
  /** What the client sees, e.g. "Silk press". */
  label: string;
  /** What Search / Becca looks for when it's tapped. */
  query: string;
  /** The answer it came from, e.g. "Hair type: 4C". */
  because: string;
  category: SuitedCategory;
}

/** Most ideas shown for one category. */
export const MAX_IDEAS_PER_CATEGORY = 6;

/** Coils and kinks: 4A–4C and the general "Coily". */
const COILY: ReadonlySet<string> = new Set(['Coily', '4A', '4B', '4C']);

type Idea = [label: string, query: string | undefined];
const idea = (label: string, query?: string): Idea => [label, query];

const SILK_PRESS = idea('Silk press');
const KNOTLESS = idea('Knotless braids');
const TWISTS = idea('Twists');
const CORNROWS = idea('Cornrows');
const FAUX_LOCS = idea('Faux locs');
const WIG_INSTALL = idea('Wig install');
const DEEP_CONDITION = idea('Deep conditioning treatment', 'deep conditioning');
const TRIM = idea('Trim');
const WASH_AND_GO = idea('Wash and go');
const CURLY_CUT = idea('Curly cut');
const BLOW_DRY = idea('Blow-dry');
const CUT_AND_BLOW_DRY = idea('Cut & blow-dry', 'haircut');
const BALAYAGE = idea('Balayage');
const HIGHLIGHTS = idea('Highlights');
const HAIR_COLOUR = idea('Hair colour', 'colour');
const GLOSS = idea('Gloss treatment', 'toner');
const ROOT_COLOUR = idea('Root colour touch-up', 'root colour');
const RELAXER = idea('Relaxer touch-up', 'relaxer');
const KERATIN = idea('Keratin smoothing', 'keratin');
const LOC_RETWIST = idea('Loc retwist', 'retwist');
const STARTER_LOCS = idea('Starter locs', 'locs');
const EXTENSIONS = idea('Extensions maintenance', 'extensions');
const SCALP_TREATMENT = idea('Scalp treatment', 'scalp');

function hairIdeas(d: BeautyData): [Idea, string][] {
  // Hair type is multi-pick (4B and 4C, say). Any coily pick counts as
  // coily, so mixed coily/curly hair never gets the straight-hair ideas.
  const types = d.hairType;
  const coily = types.some(t => COILY.has(t));
  const curly = types.includes('Curly');
  const textured = coily || curly;
  const goals = new Set(d.hairGoals);
  const history = new Set(d.treatmentHistory);
  const out: [Idea, string][] = [];
  const add = (because: string, ...ideas: Idea[]) => ideas.forEach(i => out.push([i, because]));
  const goal = (g: string) => `Hair goal: ${g}`;

  // Goals first: they're what the client said they want.
  if (goals.has('Length retention')) {
    add(goal('Length retention'), ...(coily ? [KNOTLESS, TWISTS, TRIM, DEEP_CONDITION] : [TRIM, DEEP_CONDITION]));
  }
  if (goals.has('Protective styling')) add(goal('Protective styling'), KNOTLESS, TWISTS, CORNROWS, FAUX_LOCS, WIG_INSTALL);
  if (goals.has('Silk press / sleek looks')) add(goal('Silk press / sleek looks'), textured ? SILK_PRESS : BLOW_DRY);
  if (goals.has('Moisture')) add(goal('Moisture'), DEEP_CONDITION);
  if (goals.has('Healthy ends')) add(goal('Healthy ends'), TRIM);
  if (goals.has('Definition')) add(goal('Definition'), ...(textured ? [WASH_AND_GO, CURLY_CUT] : [CURLY_CUT]));
  if (goals.has('Heat-free styling') && textured) add(goal('Heat-free styling'), TWISTS, WASH_AND_GO);
  if (goals.has('Growing out a relaxer')) add(goal('Growing out a relaxer'), TRIM, DEEP_CONDITION, SILK_PRESS);
  if (goals.has('Starting or keeping locs')) add(goal('Starting or keeping locs'), STARTER_LOCS, LOC_RETWIST);
  if (goals.has('Low-maintenance styles')) {
    add(goal('Low-maintenance styles'), ...(coily ? [KNOTLESS, WIG_INSTALL] : textured ? [WASH_AND_GO, CURLY_CUT] : [CUT_AND_BLOW_DRY]));
  }
  if (goals.has('Volume')) add(goal('Volume'), BLOW_DRY);
  // Not keratin: the app doesn't propose a chemical treatment from a goal.
  // Keratin only comes up for someone who says they already have it (below).
  if (goals.has('Frizz control')) add(goal('Frizz control'), textured ? DEEP_CONDITION : BLOW_DRY);
  if (goals.has('Shine & gloss')) add(goal('Shine & gloss'), GLOSS);
  if (goals.has('Scalp care')) add(goal('Scalp care'), SCALP_TREATMENT);

  // What they already have done.
  if (history.has('Relaxed / permed')) add('Treatment history: Relaxed / permed', RELAXER, SILK_PRESS);
  if (history.has('Locs')) add('Treatment history: Locs', LOC_RETWIST);
  if (history.has('Keratin / smoothing')) add('Treatment history: Keratin / smoothing', KERATIN);
  if (history.has('Hair extensions')) add('Treatment history: Hair extensions', EXTENSIONS);
  const colourBecause =
    history.has('Coloured') ? 'Treatment history: Coloured'
    : history.has('Bleached / lightened') ? 'Treatment history: Bleached / lightened'
    : goals.has('Colour / highlights') ? goal('Colour / highlights')
    : null;
  if (colourBecause) {
    // Balayage and highlights are offered for the hair they're usually done
    // on. Coily and curly hair gets colour, plus the upkeep colour needs.
    add(colourBecause, ...(textured ? [HAIR_COLOUR, GLOSS] : [BALAYAGE, HIGHLIGHTS, ROOT_COLOUR, GLOSS]));
  }

  // The hair type itself, last, so a stated goal always leads.
  if (types.length) {
    const because = `Hair type: ${formatPickList(types)}`;
    if (coily) add(because, SILK_PRESS, KNOTLESS, TWISTS, DEEP_CONDITION, TRIM);
    else if (curly) add(because, CURLY_CUT, WASH_AND_GO, DEEP_CONDITION, SILK_PRESS);
    else if (types.includes('Wavy')) add(because, CURLY_CUT, BLOW_DRY);
    else add(because, CUT_AND_BLOW_DRY, BLOW_DRY);
  }
  return out;
}

const LONG_SHAPES: ReadonlySet<string> = new Set(['Coffin', 'Stiletto', 'Ballerina', 'Flare', 'Lipstick']);
const BOLD_VIBES: ReadonlySet<string> = new Set(['Glam', 'Bold', 'Experimental', 'Editorial']);
const QUIET_VIBES: ReadonlySet<string> = new Set(['Natural', 'Classic', 'Low-maintenance', 'Minimal']);

function nailIdeas(d: BeautyData): [Idea, string][] {
  const out: [Idea, string][] = [];
  const add = (because: string, ...ideas: Idea[]) => ideas.forEach(i => out.push([i, because]));
  for (const length of d.nailLength) {
    if (length === 'Long' || length === 'Extra long') {
      add(`Nail length: ${length}`, idea('Gel extensions', 'gel-x'), idea('Acrylic full set', 'acrylic'), idea('Infills', 'infill'));
    } else if (length === 'Short' || length === 'Medium') {
      add(`Nail length: ${length}`, idea('BIAB', 'biab'), idea('Gel manicure', 'gel'));
    } else if (length === 'Natural / bare') {
      add(`Nail length: ${length}`, idea('Russian manicure', 'manicure'), idea('BIAB', 'biab'));
    }
  }
  for (const shape of d.nailShape) {
    if (LONG_SHAPES.has(shape)) {
      add(`Nail shape: ${shape}`, idea('Acrylic full set', 'acrylic'), idea('Gel extensions', 'gel-x'), idea('Nail art', 'nail art'));
    } else {
      add(`Nail shape: ${shape}`, idea('BIAB', 'biab'), idea('Gel manicure', 'gel'));
    }
  }
  const bold = d.styleVibe.find(v => BOLD_VIBES.has(v));
  const quiet = d.styleVibe.find(v => QUIET_VIBES.has(v));
  if (bold) add(`Style: ${bold}`, idea('Nail art', 'nail art'), idea('Chrome nails', 'chrome'));
  if (quiet) add(`Style: ${quiet}`, idea('French tips', 'french'), idea('BIAB', 'biab'));
  return out;
}

const LASH_IDEAS: Record<string, Idea[]> = {
  'Natural':          [idea('Classic lashes', 'classic lashes'), idea('Lash lift & tint', 'lash lift')],
  'Classic':          [idea('Classic lashes', 'classic lashes')],
  'Wispy':            [idea('Wispy hybrid lashes', 'wispy lashes')],
  'Hybrid':           [idea('Hybrid lashes', 'hybrid lashes')],
  'Wet look':         [idea('Wet-look lashes', 'wet look lashes')],
  'Cat eye':          [idea('Cat-eye lashes', 'wispy lashes')],
  'Doll eye':         [idea('Doll-eye lashes', 'volume lashes')],
  'Dramatic':         [idea('Volume lashes', 'volume lashes')],
  'Russian volume':   [idea('Russian volume lashes', 'russian volume')],
  'Mega volume':      [idea('Mega volume lashes', 'mega volume')],
  'Lifted natural lashes': [idea('Lash lift & tint', 'lash lift')],
};
const LASH_STATUS_IDEAS: Record<string, Idea[]> = {
  'Currently have extensions': [idea('Lash infill', 'lash infill')],
  'Growing out':               [idea('Lash removal', 'lash removal'), idea('Lash lift & tint', 'lash lift')],
  'Lash lift & tint':          [idea('Lash lift & tint', 'lash lift')],
  'Wear strip lashes':         [idea('Classic lashes', 'classic lashes')],
};
const BROW_IDEAS: Record<string, Idea[]> = {
  'Natural':       [idea('Brow shape', 'brow shape'), idea('Threading', 'threading')],
  'Defined':       [idea('HD brows', 'hd brows'), idea('Brow tint', 'brow tint')],
  'Bold':          [idea('HD brows', 'hd brows'), idea('Brow tint', 'brow tint')],
  'Laminated':     [idea('Brow lamination', 'brow lamination')],
  'Fluffy':        [idea('Brow lamination', 'brow lamination')],
  'Feathered':     [idea('Brow lamination', 'brow lamination')],
  'Soft arch':     [idea('Brow shape', 'brow shape')],
  'Ombré / powder': [idea('Powder brows', 'powder brows')],
  'Microbladed':   [idea('Microblading top-up', 'microblading')],
};
const BROW_CONDITION_IDEAS: Record<string, Idea[]> = {
  'Sparse':               [idea('Brow tint', 'brow tint'), idea('HD brows', 'hd brows')],
  'Overplucked':          [idea('Brow tint', 'brow tint'), idea('Brow mapping', 'brow mapping')],
  'Uneven':               [idea('Brow mapping', 'brow mapping'), idea('Brow shape', 'brow shape')],
  'Unruly':               [idea('Brow lamination', 'brow lamination')],
  'Light / barely there': [idea('Brow tint', 'brow tint')],
};

function lashBrowIdeas(d: BeautyData): [Idea, string][] {
  const out: [Idea, string][] = [];
  const from = (table: Record<string, Idea[]>, values: string | readonly string[], label: string) =>
    (typeof values === 'string' ? [values] : values).forEach(value =>
      (table[value] ?? []).forEach(i => out.push([i, `${label}: ${value}`])));
  from(LASH_STATUS_IDEAS, d.lashStatus, 'Lashes');
  from(LASH_IDEAS, d.lashStyle, 'Lash style');
  from(BROW_IDEAS, d.browStyle, 'Brow style');
  from(BROW_CONDITION_IDEAS, d.browCondition, 'Brows');
  return out;
}

function makeupIdeas(d: BeautyData): [Idea, string][] {
  const out: [Idea, string][] = [];
  const add = (because: string, ...ideas: Idea[]) => ideas.forEach(i => out.push([i, because]));
  for (const coverage of d.makeupCoverage) {
    if (coverage === 'Full glam') add(`Coverage: ${coverage}`, idea('Full glam makeup', 'full glam'));
    else if (coverage === 'Medium coverage') add(`Coverage: ${coverage}`, idea('Soft glam makeup', 'soft glam'));
    else if (coverage === 'Sheer / natural') add(`Coverage: ${coverage}`, idea('Natural makeup', 'natural makeup'), idea('Soft glam makeup', 'soft glam'));
  }
  for (const eyes of d.makeupEyes) {
    if (eyes === 'Smoky') add(`Eyes: ${eyes}`, idea('Smoky eye', 'smokey eye'));
    else if (eyes === 'Cut crease') add(`Eyes: ${eyes}`, idea('Cut crease', 'cut crease'));
    else if (eyes === 'Graphic liner') add(`Eyes: ${eyes}`, idea('Graphic liner', 'graphic liner'));
    else if (eyes === 'Bold / dramatic') add(`Eyes: ${eyes}`, idea('Full glam makeup', 'full glam'));
  }
  const dewy = d.makeupFinish.find(f => f === 'Dewy' || f === 'Glowy');
  if (dewy) add(`Finish: ${dewy}`, idea('Dewy skin makeup', 'dewy'));
  if (d.styleVibe.includes('Editorial')) add('Style: Editorial', idea('Editorial makeup', 'editorial'));
  if (d.styleVibe.includes('Glam')) add('Style: Glam', idea('Full glam makeup', 'full glam'));
  if (d.makeupCoverage.length || d.makeupEyes.length) add('Your makeup answers', idea('Makeup lesson', 'makeup lesson'));
  return out;
}

const BUILDERS: Record<SuitedCategory, (d: BeautyData) => [Idea, string][]> = {
  hair: hairIdeas,
  nails: nailIdeas,
  lashesBrows: lashBrowIdeas,
  makeup: makeupIdeas,
};

export function isSuitedCategory(key: CategoryKey): key is SuitedCategory {
  return key in BUILDERS;
}

/**
 * The services that suit this client in one category, best first, each once.
 * Empty when the category's answers say nothing yet (or for a category that
 * never has ideas, like Skin).
 */
export function suitedIdeas(category: CategoryKey, d: BeautyData, max = MAX_IDEAS_PER_CATEGORY): SuitedIdea[] {
  if (!isSuitedCategory(category)) return [];
  const seen = new Set<string>();
  const out: SuitedIdea[] = [];
  for (const [[label, query], because] of BUILDERS[category](d)) {
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, query: query ?? label.toLowerCase(), because, category });
    if (out.length >= max) break;
  }
  return out;
}

/** Every category's ideas, for answers that span the whole profile (Becca). */
export function allSuitedIdeas(d: BeautyData, perCategory = 3): SuitedIdea[] {
  return (Object.keys(BUILDERS) as SuitedCategory[]).flatMap(c => suitedIdeas(c, d, perCategory));
}
