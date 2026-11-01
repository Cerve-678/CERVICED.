/**
 * The words a provider can tag a service with, the template services that
 * come pre-tagged, and which category kind a category name belongs to.
 *
 * Moved out of InfoRegScreen so the quick service editor on My Services, the
 * "help clients find your services" review, and suggestServiceDetails() all
 * read the one list the full editor offers. Tags are what client Search
 * matches beyond a service's name (search_services_ranked scores them just
 * under the name), so a tag missing here is a search a client can't make.
 */

import { editDistance, normalizeTerm, tokenize } from '../../utils/fuzzyMatch';

/** Mirrors ServiceData['serviceType'] in InfoRegScreen and services.service_type. */
export type ServiceTypeValue = 'treatment' | 'enhancement' | 'maintenance' | 'restorative' | 'consultation' | '';

// ─── Category kinds ──────────────────────────────────────────────────────────
// Every category a provider adds is tied to one of these "kinds". The kind is
// what drives the smart suggestions below (templates, tags, trend names), so a
// category named "Braids" or "Injectables" still gets HAIR / AESTHETICS help.
export type CategoryKind = 'HAIR' | 'NAILS' | 'LASHES' | 'BROWS' | 'MUA' | 'AESTHETICS' | 'OTHER';

export const CATEGORY_KINDS: CategoryKind[] = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];

// Keyword hints so free-text / imported category names still resolve to a kind.
const CATEGORY_KEYWORDS: Record<CategoryKind, string[]> = {
  HAIR:       ['hair', 'braid', 'loc', 'weave', 'wig', 'silk press', 'blow', 'cut', 'colour', 'color', 'balayage', 'extension', 'twist', 'cornrow'],
  NAILS:      ['nail', 'mani', 'pedi', 'acrylic', 'gel', 'biab', 'polish'],
  LASHES:     ['lash', 'extension set', 'lift'],
  BROWS:      ['brow', 'microblad', 'lamination', 'threading'],
  MUA:        ['makeup', 'make up', 'mua', 'glam', 'bridal face'],
  AESTHETICS: ['aesthetic', 'facial', 'skin', 'peel', 'filler', 'botox', 'injectable', 'needling', 'wax', 'laser', 'hifu', 'derma'],
  OTHER:      [],
};

/** Resolve a category name to a kind — exact match → keyword match → fallback. */
export const inferCategoryKind = (name: string, fallback: string = 'OTHER'): CategoryKind => {
  const upper = (name || '').trim().toUpperCase();
  if ((CATEGORY_KINDS as string[]).includes(upper)) return upper as CategoryKind;
  const lower = (name || '').toLowerCase();
  for (const kind of CATEGORY_KINDS) {
    if (kind === 'OTHER') continue;
    if (CATEGORY_KEYWORDS[kind].some(kw => lower.includes(kw))) return kind;
  }
  const fb = (fallback || '').trim().toUpperCase();
  return (CATEGORY_KINDS as string[]).includes(fb) ? (fb as CategoryKind) : 'OTHER';
};

// ─── Tag presets per context ─────────────────────────────────────────────────

// "Style / Vibe" — a shared core plus a few flavours that fit each kind.
export const STYLE_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['natural', 'glam', 'sleek', 'lived-in', 'boho', 'edgy', 'classic', 'bold', 'romantic', 'textured', 'polished', 'undone', 'vintage'],
  NAILS:      ['natural', 'glam', 'minimalist', 'y2k', 'baddie', 'soft-girl', 'editorial', 'bold', 'chrome', 'french-inspired', 'grunge', 'coquette', 'clean-girl'],
  LASHES:     ['natural', 'glam', 'wispy', 'doll', 'baddie', 'dramatic', 'classic', 'bold', 'fluffy', 'cat-eye', 'anime', 'soft-glam'],
  BROWS:      ['natural', 'fluffy', 'defined', 'soft-girl', 'bold', 'editorial', 'classic', 'feathered', 'sculpted', 'arched', 'minimal'],
  MUA:        ['natural', 'glam', 'editorial', 'soft-girl', 'clean-girl', 'bridal', 'bold', 'dewy', 'matte', 'sun-kissed', 'vintage-glam', 'monochrome'],
  AESTHETICS: ['natural', 'glow-up', 'subtle', 'preventative', 'rejuvenating', 'clinical', 'natural-enhancement', 'restorative', 'youthful', 'refined'],
  OTHER:      ['natural', 'glam', 'editorial', 'classic', 'minimalist', 'bold', 'modern', 'timeless'],
};

// "Best for (occasion)" — universal set, with a tailored list for aesthetics.
export const OCCASION_TAGS_DEFAULT = ['bridal', 'everyday', 'date-night', 'prom', 'photoshoot', 'festival', 'birthday', 'event', 'party', 'graduation', 'holiday', 'girls-night', 'anniversary', 'vacation'];
export const OCCASION_TAGS_BY_CATEGORY: Partial<Record<CategoryKind, string[]>> = {
  AESTHETICS: ['pre-wedding', 'event-prep', 'maintenance', 'glow-up', 'confidence-boost', 'anti-ageing', 'everyday', 'special-occasion', 'seasonal-refresh', 'first-treatment'],
};

export const TECHNIQUE_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  // The second line of each list is the words clients search with that the
  // first line didn't cover (search_events, 2026-10-25): a provider can't be
  // found for "wig install" or "pedicure" if no service can be tagged it.
  HAIR:       ['balayage', 'highlights', 'ombre', 'keratin', 'relaxer', 'braids', 'locs', 'twists', 'extensions', 'colour', 'foilyage', 'colour-correction', 'perm', 'silk-press', 'weave', 'toner',
               'haircut', 'trim', 'blow-dry', 'wig-install', 'frontal', 'closure', 'sew-in', 'knotless', 'box-braids', 'cornrows', 'faux-locs', 'retwist', 'ponytail', 'tape-ins', 'micro-rings', 'nano-rings', 'clip-ins', 'fade', 'beard', 'updo'],
  NAILS:      ['gel', 'acrylic', 'biab', 'nail-art', 'french', 'ombre', 'chrome', 'dip-powder', 'gel-x', 'polygel', 'encapsulated', 'hand-painted', '3d-art', 'cat-eye-gel',
               'manicure', 'pedicure', 'infill', 'press-ons', 'extensions', 'removal', 'almond', 'stiletto', 'coffin', 'square', 'oval', 'toes'],
  LASHES:     ['classic', 'hybrid', 'volume', 'mega-volume', 'lash-lift', 'lash-tint', 'russian', 'wispy', 'mink', 'faux-mink', 'colored-lashes', 'bottom-lashes',
               'lash-extensions', 'infill', 'removal', 'spikes', 'wet-look-lashes', 'strip-lashes'],
  BROWS:      ['microblading', 'powder-brow', 'combo-brow', 'lamination', 'tinting', 'hd-brows', 'threading', 'waxing', 'nano-brows', 'brow-mapping', 'henna-brows', 'wax-and-thread',
               'brow-shape', 'brow-tint', 'touch-up'],
  MUA:        ['airbrush', 'full-glam', 'editorial', 'natural', 'bridal', 'sfx', 'cut-crease', 'dewy', 'contour-and-highlight', 'strobing', 'baking', 'graphic-liner',
               'soft-glam', 'smokey-eye', 'bridal-trial', 'makeup-lesson', 'lashes-included', 'prom-makeup', 'party-makeup'],
  AESTHETICS: ['microneedling', 'chemical-peel', 'dermaplaning', 'hifu', 'filler', 'botox', 'laser', 'hydrafacial', 'mesotherapy', 'prp', 'led-therapy', 'radiofrequency', 'cryotherapy', 'lymphatic-drainage',
               'anti-wrinkle', 'lip-filler', 'cheek-filler', 'skin-booster', 'fat-dissolving', 'thread-lift', 'facial', 'peel', 'massage', 'skin-consultation'],
  OTHER:      [],
};

export const OUTCOME_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['volume', 'length', 'shine', 'grey-coverage', 'protection', 'growth', 'smoothness', 'definition', 'texture', 'colour-vibrancy', 'repair', 'bounce'],
  NAILS:      ['length', 'art', 'colour', 'strength', 'natural-look', 'durability', 'shine', 'flexibility', 'precision'],
  LASHES:     ['volume', 'length', 'definition', 'lift', 'curl', 'dramatic', 'natural-look', 'symmetry', 'longevity'],
  BROWS:      ['definition', 'shape', 'fullness', 'natural', 'bold', 'arched', 'symmetry', 'longevity', 'precision'],
  MUA:        ['glow', 'coverage', 'definition', 'lifted', 'natural-look', 'dramatic', 'longevity', 'radiance', 'flawless-finish', 'camera-ready'],
  AESTHETICS: ['glow', 'firmness', 'smoothness', 'rejuvenation', 'definition', 'hydration', 'reduction', 'lifting', 'even-tone', 'collagen-boost', 'pore-refinement', 'radiance'],
  OTHER:      ['results', 'enhancement', 'maintenance', 'confidence', 'refresh'],
};

// Viral / trend names clients actually search for — now per kind so a lash artist
// never sees "soap-brows" and a nail tech never sees "butterfly-lashes".
export const TREND_NAMES_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['butterfly-cut', 'money-piece', 'expensive-brunette', 'old-money', 'mob-wife', 'cherry-cola', 'copper', 'lived-in', 'curtain-bangs', 'jellyfish-cut', 'clean-girl-bun', 'wolf-cut', 'chocolate-cherry', 'buttery-blonde'],
  NAILS:      ['glazed-donut', 'blueberry-milk', 'cherry-cola', 'chrome', 'aura-nails', 'milky-white', 'strawberry-girl', 'velvet', 'lip-gloss', 'jelly-nails', 'cat-eye', 'french-tip-revival', 'mob-wife-nails'],
  LASHES:     ['butterfly-lashes', 'manga-lashes', 'anime-lashes', 'wet-look', 'fox-eye', 'natural-classic', 'kim-k', 'angel-lashes', 'clean-girl-lashes', 'doll-eye', 'colored-tips'],
  BROWS:      ['soap-brows', 'brow-lamination', 'fluffy-brows', 'fox-brows', 'feathered', 'snatched-arch', 'nano-brows', 'skinny-brow-revival', 'laminated-and-tinted'],
  MUA:        ['clean-girl', 'latte-makeup', 'strawberry-girl', 'sunburn-blush', 'cold-girl', 'douyin', 'siren-eyes', 'glazed', 'tomato-girl', 'mob-wife-glam', 'espresso-makeup'],
  AESTHETICS: ['glass-skin', 'baby-botox', 'russian-lips', 'lip-flip', 'skinboosters', 'glazed-donut-skin', 'snatched', 'fox-eye-lift', 'preventative-botox', 'liquid-facelift', 'tear-trough-filler'],
  OTHER:      ['clean-girl', 'old-money', 'that-girl', 'quiet-luxury', 'coastal-grandma', 'mob-wife'],
};

// Pre-built service starting points offered the moment a provider taps "Add
// Service" — pre-fills name + duration so most services are two taps to save.
export interface ServiceTemplate {
  name: string;
  duration: string;
  serviceType?: ServiceTypeValue;
  description?: string;
  styleTags?: string[];
  techniqueTags?: string[];
  outcomeTags?: string[];
  occasionTags?: string[];
  trendNames?: string[];
  /** Always offered as a starting point, regardless of which specific
   *  subcategory is selected — e.g. a consultation. Not filtered out even
   *  when a subcategory's template list is otherwise narrowed. */
  generic?: boolean;
}
export const SERVICE_TEMPLATES_BY_CATEGORY: Record<CategoryKind, ServiceTemplate[]> = {
  HAIR: [
    { name: 'Consultation',          duration: '20 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Cut & Blow Dry',        duration: '1 hr',      description: 'A fresh cut finished with a smooth, salon-quality blow dry.', styleTags: ['sleek'], techniqueTags: [], outcomeTags: ['shine', 'definition'] },
    { name: 'Blow Dry',              duration: '45 min',    description: 'Wash and blow dry for a bouncy, salon-fresh finish.', styleTags: ['sleek', 'glam'], outcomeTags: ['volume', 'shine'] },
    { name: 'Full Head Highlights',  duration: '3 hr',       description: 'Dimensional highlights all over for a lighter, sun-kissed look.', techniqueTags: ['highlights', 'colour'], outcomeTags: ['shine', 'definition'], trendNames: ['expensive-brunette', 'money-piece'] },
    { name: 'Balayage',              duration: '3 hr',       description: 'Hand-painted, low-maintenance colour that grows out beautifully.', techniqueTags: ['balayage', 'colour'], outcomeTags: ['shine', 'definition'], trendNames: ['lived-in', 'money-piece', 'expensive-brunette'] },
    { name: 'Root Tint',             duration: '1 hr 30',    description: 'Root touch-up to keep your colour looking fresh between full appointments.', techniqueTags: ['colour'], outcomeTags: ['grey-coverage', 'shine'] },
    { name: 'Toner / Gloss',         duration: '30 min',     description: 'A quick gloss to refresh tone and add mirror-like shine.', techniqueTags: ['colour'], outcomeTags: ['shine'] },
    { name: 'Keratin Treatment',     duration: '2 hr 30',    description: 'Smoothing treatment that cuts frizz and adds long-lasting shine.', techniqueTags: ['keratin'], outcomeTags: ['smoothness', 'shine', 'protection'] },
    { name: 'Knotless Braids',       duration: '4 hr',       description: 'Tension-free knotless braids, neat at the root and lightweight to wear.', techniqueTags: ['braids'], outcomeTags: ['protection', 'length'], trendNames: [] },
    { name: 'Silk Press',            duration: '1 hr 30',    description: 'Silky, salon-smooth press that shows off your natural length and shine.', outcomeTags: ['shine', 'smoothness'] },
    { name: 'Wig Install',           duration: '2 hr',       description: 'Melted, natural-looking wig install customised to your hairline.', techniqueTags: ['extensions'], outcomeTags: ['definition', 'volume'] },
    { name: 'Dry Cut',               duration: '30 min',     description: 'A precision cut with no wash or blow dry — quick shape-up between appointments.', outcomeTags: ['definition'] },
    { name: 'Half Head Highlights',  duration: '2 hr',       description: 'Highlights around the face and crown for a lighter look without going full head.', techniqueTags: ['highlights', 'colour'], outcomeTags: ['shine', 'definition'] },
    { name: 'Cornrows',              duration: '2 hr 30',    description: 'Neat, close-to-the-scalp cornrows — straight back or in a custom pattern.', techniqueTags: ['braids'], outcomeTags: ['protection', 'length'] },
    { name: 'Deep Conditioning Treatment', duration: '45 min', description: 'Intensive moisture treatment to restore softness and strength to dry or damaged hair.', outcomeTags: ['smoothness', 'shine', 'growth'] },
    { name: "Men's Haircut",         duration: '30 min',     description: "A tailored men's cut, clippers or scissor work to your preferred style.", outcomeTags: ['definition'] },
    { name: 'Beard Trim',            duration: '20 min',     description: 'Shape and tidy for a sharp, well-defined beard line.', outcomeTags: ['definition'] },
    { name: 'Foilyage',              duration: '2 hr 30',    description: 'Foil-placed balayage for brighter, more blended dimension.', techniqueTags: ['foilyage', 'highlights'], outcomeTags: ['shine', 'colour-vibrancy'], trendNames: ['money-piece'] },
    { name: 'Colour Correction',     duration: '4 hr',       serviceType: 'restorative', description: 'Corrective colour work to fix tone, banding or previous colour gone wrong.', techniqueTags: ['colour-correction'], outcomeTags: ['colour-vibrancy', 'repair'] },
    { name: 'Perm',                  duration: '2 hr',       description: 'Chemical wave treatment for lasting curl or texture.', techniqueTags: ['perm'], outcomeTags: ['texture', 'bounce'] },
    { name: 'Weave Install',         duration: '3 hr',       description: 'Sewn-in weave for extra length and volume with a seamless blend.', techniqueTags: ['weave', 'extensions'], outcomeTags: ['length', 'volume'] },
    { name: 'Fringe / Bangs Trim',   duration: '15 min',     description: 'Quick shape-up to keep your fringe fresh between full cuts.', outcomeTags: ['definition'] },
  ],
  NAILS: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Gel Manicure',          duration: '45 min',    description: 'Chip-resistant gel polish with shaping and cuticle care.', techniqueTags: ['gel'], outcomeTags: ['colour', 'durability'] },
    { name: 'BIAB Overlay',          duration: '1 hr',       description: 'Strengthening builder gel overlay for stronger, healthier natural nails.', techniqueTags: ['biab'], outcomeTags: ['strength', 'durability'] },
    { name: 'Acrylic Full Set',      duration: '1 hr 30',    description: 'Full set of acrylic extensions, shaped and finished to your choice of length.', techniqueTags: ['acrylic'], outcomeTags: ['length', 'durability'] },
    { name: 'Gel-X Extensions',      duration: '1 hr 30',    description: 'Lightweight, flexible gel-x tips for a natural-feeling extension.', techniqueTags: ['gel-x'], outcomeTags: ['length', 'natural-look'], trendNames: ['milky-white'] },
    { name: 'Infill',                duration: '1 hr',       description: 'Infill to keep your extensions neat as your natural nail grows through.', techniqueTags: ['acrylic', 'gel'], outcomeTags: ['durability'] },
    { name: 'Soak Off & Removal',    duration: '30 min',     description: 'Gentle removal of gel or acrylic with nail and cuticle care after.', outcomeTags: ['natural-look'] },
    { name: 'Gel Pedicure',          duration: '45 min',     description: 'Full pedicure with long-lasting gel polish and a relaxing soak.', techniqueTags: ['gel'], outcomeTags: ['colour', 'durability'] },
    { name: 'Nail Art (per nail)',   duration: '15 min',     description: 'Custom nail art add-on, priced per nail — hand-painted or with embellishments.', techniqueTags: ['nail-art'], outcomeTags: ['art', 'colour'], trendNames: ['chrome', 'aura-nails'] },
    { name: 'Classic Manicure',      duration: '30 min',     description: 'Shape, cuticle care and regular polish for a clean, natural finish.', outcomeTags: ['natural-look'] },
    { name: 'Classic Pedicure',      duration: '30 min',     description: 'Soak, shape and regular polish with a relaxing foot massage.', outcomeTags: ['natural-look'] },
    { name: 'French Tips',           duration: '45 min',     description: 'The timeless French manicure — clean white tips over a natural base.', techniqueTags: ['french'], outcomeTags: ['art', 'colour'] },
    { name: 'Dip Powder Set',        duration: '1 hr',       description: 'Durable dip powder colour, built up in layers for strength and shine.', techniqueTags: ['dip-powder'], outcomeTags: ['colour', 'durability'] },
    { name: 'Polygel Full Set',      duration: '1 hr 30',    description: 'Lightweight, flexible polygel extensions built up on tips or forms.', techniqueTags: ['polygel'], outcomeTags: ['length', 'flexibility'] },
    { name: 'Cat Eye Gel Manicure',  duration: '1 hr',       description: 'Magnetic cat-eye gel polish for a shimmering, dimensional finish.', techniqueTags: ['cat-eye-gel', 'gel'], outcomeTags: ['colour', 'shine'], trendNames: ['cat-eye'] },
    { name: '3D Nail Art (per nail)', duration: '20 min',    description: 'Sculpted 3D embellishments and charms, priced per nail.', techniqueTags: ['3d-art'], outcomeTags: ['art', 'precision'] },
    { name: 'Encapsulated Nail Art', duration: '1 hr 15',    description: 'Delicate design or foil sealed under a clear gel layer for lasting shine.', techniqueTags: ['encapsulated', 'nail-art'], outcomeTags: ['art', 'durability'] },
    { name: 'Nail Repair (per nail)', duration: '10 min',    description: 'Fixes a broken or lifted nail without a full new set.', outcomeTags: ['strength', 'durability'] },
  ],
  LASHES: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Classic Full Set',      duration: '1 hr 30',    description: 'One extension per natural lash for a subtle, everyday enhancement.', techniqueTags: ['classic'], outcomeTags: ['length', 'definition'], trendNames: ['natural-classic'] },
    { name: 'Hybrid Full Set',       duration: '2 hr',       description: 'A mix of classic and volume fans for texture with added fullness.', techniqueTags: ['hybrid'], outcomeTags: ['volume', 'definition'] },
    { name: 'Volume Full Set',       duration: '2 hr 30',    description: 'Lightweight fans of fine lashes for a fuller, fluffier look.', techniqueTags: ['volume'], outcomeTags: ['volume', 'dramatic'], trendNames: ['wet-look'] },
    { name: 'Mega Volume',           duration: '2 hr 30',    description: 'Maximum density fans for a bold, glam lash look.', techniqueTags: ['mega-volume'], outcomeTags: ['volume', 'dramatic'], trendNames: ['kim-k'] },
    { name: 'Infill (2–3 weeks)',    duration: '1 hr',       description: 'Top-up on natural lash growth to keep your set full.', outcomeTags: ['volume'] },
    { name: 'Lash Lift & Tint',      duration: '1 hr',       description: 'Curls and tints your natural lashes for an extension-free lift.', techniqueTags: ['lash-lift', 'lash-tint'], outcomeTags: ['curl', 'definition'], trendNames: ['natural-classic'] },
    { name: 'Lash Removal',          duration: '30 min',     description: 'Safe, gentle removal of extensions without damaging natural lashes.' },
    { name: 'Wispy Lash Set',        duration: '2 hr',       description: 'Textured, spiky fans mixed through the set for a fluttery, wispy finish.', techniqueTags: ['wispy'], outcomeTags: ['definition', 'volume'] },
    { name: 'Russian Volume Set',    duration: '2 hr 30',    description: 'Handmade Russian fans for ultra-fluffy, full volume lashes.', techniqueTags: ['russian'], outcomeTags: ['volume', 'dramatic'] },
    { name: 'Lash Tint Only',        duration: '20 min',     description: 'Tints natural lashes darker — no extensions, just definition.', techniqueTags: ['lash-tint'], outcomeTags: ['definition'] },
    { name: 'Mink Full Set',         duration: '2 hr',       description: 'Ultra-soft mink lashes for a naturally glamorous, long-lasting set.', techniqueTags: ['mink'], outcomeTags: ['volume', 'longevity'] },
    { name: 'Faux Mink Full Set',    duration: '2 hr',       description: 'Cruelty-free faux mink lashes with a soft, natural-looking finish.', techniqueTags: ['faux-mink'], outcomeTags: ['volume', 'natural-look'] },
    { name: 'Colored Lash Set',      duration: '2 hr',       description: 'Coloured lash extensions mixed through the set for a fun pop of colour.', techniqueTags: ['colored-lashes'], outcomeTags: ['dramatic', 'definition'], trendNames: ['colored-tips'] },
    { name: 'Bottom Lash Set',       duration: '45 min',     description: 'Fine extensions on the lower lash line to frame the eyes.', techniqueTags: ['bottom-lashes'], outcomeTags: ['definition', 'symmetry'] },
  ],
  BROWS: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Brow Wax & Tint',       duration: '30 min',    description: 'Shaping wax with tint to define and fill your natural brow.', techniqueTags: ['waxing', 'tinting'], outcomeTags: ['definition', 'shape'] },
    { name: 'Brow Lamination',       duration: '45 min',     description: 'Brushed-up, fluffy brows that hold their shape for weeks.', techniqueTags: ['lamination'], outcomeTags: ['fullness', 'shape'], trendNames: ['soap-brows', 'fluffy-brows'] },
    { name: 'HD Brows',              duration: '45 min',     description: 'Tailored shape using tint, wax and precision trimming for a defined finish.', techniqueTags: ['hd-brows'], outcomeTags: ['definition', 'arched'] },
    { name: 'Microblading',          duration: '2 hr',       serviceType: 'treatment', description: 'Semi-permanent hair-stroke tattoo for naturally fuller-looking brows.', techniqueTags: ['microblading'], outcomeTags: ['fullness', 'natural'] },
    { name: 'Powder / Ombré Brows',  duration: '2 hr',       serviceType: 'treatment', description: 'Soft, powdered semi-permanent makeup finish for defined, filled-in brows.', techniqueTags: ['powder-brow', 'combo-brow'], outcomeTags: ['definition', 'bold'], trendNames: ['snatched-arch'] },
    { name: 'Threading',             duration: '15 min',     description: 'Precise thread shaping for clean, natural brow lines.', techniqueTags: ['threading'], outcomeTags: ['shape', 'natural'] },
    { name: 'Brow Henna',            duration: '30 min',     description: 'Natural henna tint that stains both the hairs and the skin beneath for extra fullness.', techniqueTags: ['tinting'], outcomeTags: ['fullness', 'natural'] },
    { name: 'Combo Brows',           duration: '2 hr',       serviceType: 'treatment', description: 'Microblading strokes with shaded powder underneath for a soft, defined finish.', techniqueTags: ['combo-brow'], outcomeTags: ['definition', 'fullness'] },
    { name: 'Brow Mapping Consultation', duration: '20 min', serviceType: 'consultation', description: 'Measuring and mapping your ideal brow shape before a semi-permanent treatment.' },
    { name: 'Nano Brows',            duration: '2 hr',       serviceType: 'treatment', description: 'Ultra-fine hair-stroke semi-permanent brows for a crisp, natural finish.', techniqueTags: ['nano-brows'], outcomeTags: ['precision', 'fullness'], trendNames: ['nano-brows'] },
    { name: 'Wax & Thread Combo',    duration: '25 min',     description: 'Wax for the bulk of the shape, thread for precision around the brow line.', techniqueTags: ['wax-and-thread'], outcomeTags: ['shape', 'precision'] },
    { name: 'Brow Lamination & Tint', duration: '1 hr',      description: 'Lamination for hold plus a tint for fuller, longer-lasting definition.', techniqueTags: ['lamination', 'tinting'], outcomeTags: ['fullness', 'longevity'], trendNames: ['laminated-and-tinted'] },
  ],
  MUA: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Full Glam',             duration: '1 hr',       description: 'Full-coverage glam makeup built for photos and a big night out.', styleTags: ['glam'], techniqueTags: ['full-glam'], outcomeTags: ['glow', 'coverage', 'dramatic'] },
    { name: 'Soft Glam',             duration: '1 hr',       description: 'Everyday-wearable glam with soft definition and a lit-from-within glow.', styleTags: ['soft-girl', 'glam'], outcomeTags: ['glow', 'natural-look'], trendNames: ['clean-girl', 'latte-makeup'] },
    { name: 'Bridal Makeup',         duration: '1 hr 30',    description: 'Long-wear bridal makeup designed to look flawless all day and in photos.', styleTags: ['bridal'], techniqueTags: ['bridal'], outcomeTags: ['longevity', 'glow'], occasionTags: ['bridal'] },
    { name: 'Bridal Trial',          duration: '1 hr 30',    description: 'Full trial run of your bridal look ahead of the big day.', styleTags: ['bridal'], techniqueTags: ['bridal'], occasionTags: ['bridal'] },
    { name: 'Everyday Makeup',       duration: '45 min',     description: 'Fresh, skin-like makeup that enhances your features without heavy coverage.', styleTags: ['natural', 'clean-girl'], techniqueTags: ['natural'], outcomeTags: ['natural-look', 'glow'], trendNames: ['clean-girl'] },
    { name: 'No-Makeup Makeup',      duration: '40 min',     description: 'Barely-there base and definition that looks like your skin, just better.', styleTags: ['natural'], techniqueTags: ['natural'], outcomeTags: ['natural-look', 'glow'] },
    { name: 'Natural Glam',          duration: '1 hr',       description: 'Natural-look glam that keeps definition soft without a full-coverage face.', styleTags: ['natural', 'glam'], techniqueTags: ['natural'], outcomeTags: ['glow', 'definition', 'natural-look'] },
    { name: 'Clean Girl Makeup',     duration: '45 min',     description: 'Skin-first, barely-there makeup with glossy lids and soft blush — the clean-girl look.', styleTags: ['clean-girl', 'natural'], techniqueTags: ['natural'], outcomeTags: ['glow', 'natural-look'], trendNames: ['clean-girl', 'latte-makeup'] },
    { name: 'Dewy / Glowy Glam',     duration: '1 hr',       description: 'Luminous, hydrated-looking base built for maximum glow without heavy powder.', styleTags: ['dewy', 'glam'], techniqueTags: ['dewy'], outcomeTags: ['glow', 'radiance'] },
    { name: 'Matte Glam',            duration: '1 hr',       description: 'Full-coverage matte base with softly defined eyes for a shine-free finish that lasts.', styleTags: ['matte', 'glam'], outcomeTags: ['coverage', 'longevity', 'definition'] },
    { name: 'Makeup Lesson',         duration: '2 hr',       description: 'One-to-one lesson to learn techniques tailored to your face and routine.', outcomeTags: ['definition'] },
    { name: 'Airbrush Makeup',       duration: '1 hr 15',    description: 'Lightweight, buildable airbrush foundation for flawless, long-wear coverage.', techniqueTags: ['airbrush'], outcomeTags: ['coverage', 'longevity'] },
    { name: 'Editorial / Photoshoot Makeup', duration: '1 hr 30', description: 'Bold, camera-ready looks designed for photography and editorial shoots.', techniqueTags: ['editorial'], outcomeTags: ['dramatic', 'definition'], occasionTags: ['photoshoot'] },
    { name: 'SFX Makeup',            duration: '2 hr',       description: 'Special-effects makeup for creative, theatrical or costume looks.', techniqueTags: ['sfx'], outcomeTags: ['dramatic'] },
    { name: 'Contour & Highlight Session', duration: '45 min', description: 'Sculpted contour and highlight for a defined, camera-ready glow.', techniqueTags: ['contour-and-highlight'], outcomeTags: ['definition', 'radiance'] },
    { name: 'Strobing Glow Makeup',  duration: '1 hr',       description: 'Dewy, light-reflecting strobing technique for a lit-from-within glow.', techniqueTags: ['strobing'], outcomeTags: ['glow', 'radiance'] },
    { name: 'Graphic Liner Look',    duration: '45 min',     description: 'Bold graphic eyeliner styling for a striking, editorial-ready eye.', techniqueTags: ['graphic-liner'], outcomeTags: ['dramatic', 'definition'] },
    { name: 'Baking & Setting Makeup', duration: '1 hr',     description: 'Baked, set-in-place base makeup built to last all day and photograph flawlessly.', techniqueTags: ['baking'], outcomeTags: ['flawless-finish', 'longevity'] },
  ],
  AESTHETICS: [
    { name: 'Skin Consultation',        duration: '30 min', serviceType: 'consultation', description: 'In-depth skin assessment and a personalised treatment plan.', generic: true },
    { name: 'Anti-Wrinkle (1 area)',    duration: '30 min', serviceType: 'treatment',    description: 'Targeted anti-wrinkle treatment for one area to soften fine lines.', techniqueTags: ['botox'], outcomeTags: ['smoothness'], trendNames: ['baby-botox'] },
    { name: 'Anti-Wrinkle (3 areas)',   duration: '45 min', serviceType: 'treatment',    description: 'Full upper-face anti-wrinkle treatment across three areas.', techniqueTags: ['botox'], outcomeTags: ['smoothness', 'rejuvenation'] },
    { name: 'Lip Filler (0.5ml)',       duration: '45 min', serviceType: 'enhancement',  description: 'Subtle lip enhancement for natural volume and hydration.', techniqueTags: ['filler'], outcomeTags: ['hydration', 'definition'], trendNames: ['lip-flip'] },
    { name: 'Lip Filler (1ml)',         duration: '1 hr',   serviceType: 'enhancement',  description: 'Fuller lip enhancement with balanced, natural-looking volume.', techniqueTags: ['filler'], outcomeTags: ['hydration', 'definition'], trendNames: ['russian-lips'] },
    { name: 'Cheek Filler',             duration: '45 min', serviceType: 'enhancement',  description: 'Contours and lifts the mid-face for a naturally sculpted look.', techniqueTags: ['filler'], outcomeTags: ['lifting', 'definition'], trendNames: ['snatched'] },
    { name: 'Chemical Peel',            duration: '45 min', serviceType: 'treatment',    description: 'Resurfacing peel to brighten tone and refine texture.', techniqueTags: ['chemical-peel'], outcomeTags: ['glow', 'smoothness'], trendNames: ['glass-skin'] },
    { name: 'Microneedling',            duration: '1 hr',   serviceType: 'treatment',    description: 'Collagen-boosting microneedling to improve texture and firmness.', techniqueTags: ['microneedling'], outcomeTags: ['firmness', 'rejuvenation'] },
    { name: 'HydraFacial',              duration: '1 hr',   serviceType: 'treatment',    description: 'Deep cleanse, exfoliation and hydration for an instant glow.', techniqueTags: ['hydrafacial'], outcomeTags: ['glow', 'hydration'], trendNames: ['glass-skin', 'glazed-donut-skin'] },
    { name: 'Dermaplaning',             duration: '45 min', serviceType: 'treatment',    description: 'Gentle exfoliation that removes peach fuzz for smoother, brighter skin.', techniqueTags: ['dermaplaning'], outcomeTags: ['smoothness', 'glow'] },
    { name: 'Skin Booster Treatment',   duration: '45 min', serviceType: 'treatment',    description: 'Micro-injections of hyaluronic acid to deeply hydrate and improve skin quality over a course of sessions.', techniqueTags: ['mesotherapy'], outcomeTags: ['hydration', 'glow'] },
    { name: 'Fat Dissolving Injections', duration: '30 min', serviceType: 'treatment',   description: 'Targeted injections to break down small pockets of stubborn fat.', techniqueTags: ['mesotherapy'], outcomeTags: ['reduction'] },
    { name: 'Thread Lift',              duration: '1 hr',   serviceType: 'treatment',    description: 'Dissolvable threads inserted to lift and tighten sagging skin without surgery.', outcomeTags: ['lifting', 'firmness'] },
    { name: 'HIFU Facial',              duration: '1 hr',   serviceType: 'treatment',    description: 'Ultrasound energy to lift and tighten deeper skin layers, non-invasively.', techniqueTags: ['hifu'], outcomeTags: ['lifting', 'firmness'] },
    { name: 'Laser Skin Treatment',     duration: '30 min', serviceType: 'treatment',    description: 'Laser resurfacing to even tone, reduce pigmentation and refine texture.', techniqueTags: ['laser'], outcomeTags: ['smoothness', 'rejuvenation'] },
    // LED Light Therapy, Radiofrequency, Cryotherapy and Lymphatic Drainage
    // each live under their own subcategory (see SUBCATEGORY_SUGGESTIONS_BY_CATEGORY
    // + SUBCATEGORY_SCOPE below) instead of a single flat entry here, so picking
    // that subcategory shows every type of that treatment, not just one option.
    { name: 'Red Light Therapy (Anti-Ageing)', duration: '30 min', serviceType: 'treatment', description: 'Red/near-infrared light to boost collagen and calm ageing skin.', techniqueTags: ['led-therapy'], outcomeTags: ['radiance', 'collagen-boost'] },
    { name: 'Blue Light Therapy (Acne)', duration: '30 min', serviceType: 'treatment', description: 'Blue light wavelengths to target acne-causing bacteria and even tone.', techniqueTags: ['led-therapy'], outcomeTags: ['even-tone', 'pore-refinement'] },
    { name: 'Combination LED Therapy',  duration: '45 min', serviceType: 'treatment',    description: 'Multi-wavelength LED protocol combining red and blue light for an all-round glow.', techniqueTags: ['led-therapy'], outcomeTags: ['radiance', 'even-tone'] },
    { name: 'Radiofrequency Face Tightening', duration: '45 min', serviceType: 'treatment', description: 'Heat energy to stimulate collagen and firm sagging facial skin.', techniqueTags: ['radiofrequency'], outcomeTags: ['firmness', 'collagen-boost'] },
    { name: 'Radiofrequency Body Contouring', duration: '1 hr', serviceType: 'treatment', description: 'Radiofrequency energy to tighten and contour looser body skin.', techniqueTags: ['radiofrequency'], outcomeTags: ['firmness', 'reduction'] },
    { name: 'Cryotherapy Facial',       duration: '30 min', serviceType: 'treatment',    description: 'Cooling facial treatment to de-puff, tighten pores and boost radiance.', techniqueTags: ['cryotherapy'], outcomeTags: ['radiance', 'pore-refinement'] },
    { name: 'Localised Cryotherapy (Fat Freezing)', duration: '45 min', serviceType: 'treatment', description: 'Targeted cooling to reduce stubborn fat pockets and firm the area.', techniqueTags: ['cryotherapy'], outcomeTags: ['reduction', 'firmness'] },
    { name: 'Facial Lymphatic Drainage Massage', duration: '45 min', serviceType: 'treatment', description: 'Gentle facial massage technique to reduce puffiness and support circulation.', techniqueTags: ['lymphatic-drainage'], outcomeTags: ['reduction', 'glow'] },
    { name: 'Full Body Lymphatic Drainage Massage', duration: '1 hr', serviceType: 'treatment', description: 'Full-body massage technique to ease fluid retention and support circulation.', techniqueTags: ['lymphatic-drainage'], outcomeTags: ['reduction', 'firmness'] },
  ],
  OTHER: [
    { name: 'Consultation',          duration: '30 min', serviceType: 'consultation', description: 'A chance to talk through what you are looking for before booking in.', generic: true },
    { name: 'Standard Appointment',  duration: '1 hr',    description: 'Standard appointment slot — details confirmed with your provider.' },
    { name: 'Group Session',         duration: '2 hr',    description: 'A session booked for a group — details confirmed with your provider.' },
    { name: 'Follow-up Appointment', duration: '30 min',  description: 'A shorter check-in or top-up following a previous appointment.' },
    { name: 'Trial / Sample Session', duration: '30 min', description: 'A low-commitment taster session before booking the full service.', outcomeTags: ['confidence'] },
    { name: 'Refresh / Top-up',      duration: '20 min',  description: 'A quick refresh between full appointments.', outcomeTags: ['refresh'] },
  ],
};

// ─── Suggestions ────────────────────────────────────────────────────────────
// A provider who picks a template gets its tags and description filled in. A
// provider who types their own name ("Volume spikes", "Slick French") used to
// get nothing — which is how 31 of 60 live services ended up with no tags at
// all (2026-10-25). suggestServiceDetails() reads the name and menu heading
// and offers what a template would have: tags (pre-ticked, so the provider
// only removes the wrong ones), who it's for, and the nearest template's
// description. It only ever suggests; the editors show everything it returns.

export type ServiceAudienceValue = 'women' | 'men' | 'kids' | 'everyone' | '';

export interface ServiceTagGroups {
  styleTags: string[];
  techniqueTags: string[];
  outcomeTags: string[];
  occasionTags: string[];
  trendNames: string[];
}

export interface ServiceSuggestion extends ServiceTagGroups {
  /** Tags read only from the menu heading while the name gave tags of its
   *  own: offered unticked, since a heading can be a misfile ("Dermaplaning"
   *  under "Dermal Fillers"). When the name gives nothing, heading tags are
   *  in the main groups instead ("Pink princess" under "Soft Glam"). */
  alsoConsider: ServiceTagGroups;
  kind: CategoryKind;
  /** '' when neither the name nor the heading says who it's for. */
  audience: ServiceAudienceValue;
  /** The nearest template's description, when the name matches one. */
  description: string | null;
  templateName: string | null;
}

export const TAG_GROUP_KEYS: (keyof ServiceTagGroups)[] = [
  'techniqueTags', 'styleTags', 'outcomeTags', 'occasionTags', 'trendNames',
];

/** At most this many suggested tags per group, so a long name can't tick a
 *  whole row of chips the provider then has to untick. */
const MAX_SUGGESTED_PER_GROUP = 4;

// Words that say nothing about the service on their own.
const FILLER_WORDS = new Set(['and', 'the', 'a', 'an', 'of', 'per', 'with', 'only', 'or', 'for', 'my', 'your', 'x', 'no', 'service']);

// Words every service in a category shares. They prove nothing about WHICH
// template a name is: "Smokey Makeup" is not "No-Makeup Makeup".
const CATEGORY_WORDS = new Set(['makeup', 'nail', 'nails', 'hair', 'lash', 'lashes', 'brow', 'brows', 'treatment', 'treatments']);

// A provider's own word that names a tag without containing it.
const TAG_HINTS: { words: RegExp; kind: CategoryKind; group: keyof ServiceTagGroups; tag: string }[] = [
  { words: /\b(cut|cuts|chop|bob|pixie|pixi|layers?|layered)\b/, kind: 'HAIR', group: 'techniqueTags', tag: 'haircut' },
  { words: /\b(blow ?outs?|blow ?dry)\b/, kind: 'HAIR', group: 'techniqueTags', tag: 'blow-dry' },
  { words: /\b(wigs?|units?)\b/, kind: 'HAIR', group: 'techniqueTags', tag: 'wig-install' },
  { words: /\b(feet|foot|toes?)\b/, kind: 'NAILS', group: 'techniqueTags', tag: 'pedicure' },
  { words: /\b(hands?|mani)\b/, kind: 'NAILS', group: 'techniqueTags', tag: 'manicure' },
  { words: /\b(full set|extensions?)\b/, kind: 'NAILS', group: 'techniqueTags', tag: 'extensions' },
  { words: /\b(tape|tap) ?ins?\b/, kind: 'HAIR', group: 'techniqueTags', tag: 'tape-ins' },
  { words: /\b(spikes?|spiky)\b/, kind: 'LASHES', group: 'styleTags', tag: 'wispy' },
  { words: /\b(fillers?|lips?)\b/, kind: 'AESTHETICS', group: 'techniqueTags', tag: 'filler' },
  { words: /\b(anti ?wrinkle|wrinkles?)\b/, kind: 'AESTHETICS', group: 'techniqueTags', tag: 'botox' },
  { words: /\b(smok(e|ey|y))\b/, kind: 'MUA', group: 'techniqueTags', tag: 'smokey-eye' },
  { words: /\b(glam)\b/, kind: 'MUA', group: 'styleTags', tag: 'glam' },
];

const AUDIENCE_PATTERNS: { audience: Exclude<ServiceAudienceValue, '' | 'everyone'>; words: RegExp }[] = [
  { audience: 'men', words: /\b(men|mens|male|gents?|gentlemen|barber|beard|boys? cut)\b/ },
  { audience: 'kids', words: /\b(kids?|children|childrens|child|toddler|junior|teens?)\b/ },
  { audience: 'women', words: /\b(women|womens|ladies|female)\b/ },
];

function words(text: string): string[] {
  return tokenize(text).filter(w => !FILLER_WORDS.has(w) && !/^\d/.test(w));
}

/** The same word, allowing a plural or -ing/-ed ending, or one typo in a word
 *  of 5+ letters. Stricter than the Search filter's matcher on purpose: a
 *  suggestion is a tag ticked FOR the provider, so "hair" must not count as
 *  "haircut" and "twist" must not count as "retwist". */
const WORD_ENDINGS = new Set(['s', 'es', 'd', 'ed', 'ing', 'er', 'ers']);

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short)) return WORD_ENDINGS.has(long.slice(short.length));
  return short.length >= 5 && editDistance(a, b) <= 1;
}

function hasWord(haystack: string[], word: string): boolean {
  return haystack.some(h => sameWord(h, word));
}

const optionsFor = (kind: CategoryKind) => ({
  techniqueTags: TECHNIQUE_TAGS_BY_CATEGORY[kind] ?? [],
  styleTags: STYLE_TAGS_BY_CATEGORY[kind] ?? [],
  outcomeTags: OUTCOME_TAGS_BY_CATEGORY[kind] ?? [],
  occasionTags: OCCASION_TAGS_BY_CATEGORY[kind] ?? OCCASION_TAGS_DEFAULT,
  trendNames: TREND_NAMES_BY_CATEGORY[kind] ?? [],
});

/** The template a service name is most plausibly a version of, or null.
 *  "Full set acrylic" → Acrylic Full Set; "Lip Fillers (2ml)" → Lip Filler
 *  (1ml). Needs most of the template's words AND most of the name's, and
 *  at least one word of the name itself. */
function nearestTemplate(kind: CategoryKind, nameWords: string[], headingWords: string[]): ServiceTemplate | null {
  let best: { template: ServiceTemplate; score: number } | null = null;
  for (const template of SERVICE_TEMPLATES_BY_CATEGORY[kind] ?? []) {
    const templateWords = [...new Set(words(template.name).filter(w => !CATEGORY_WORDS.has(w)))];
    const ownWords = nameWords.filter(w => !CATEGORY_WORDS.has(w));
    if (templateWords.length === 0 || ownWords.length === 0) continue;
    const shared = ownWords.filter(w => hasWord(templateWords, w)).length;
    // The name itself has to share a word: a "Consultation" under a "Bridal
    // Makeup" heading is not the Bridal Makeup template.
    if (shared === 0) continue;
    const covered = templateWords.filter(w => hasWord([...ownWords, ...headingWords], w)).length / templateWords.length;
    const nameCovered = shared / ownWords.length;
    // All of the template's words, or most of both sides with 2+ in common.
    // One shared word isn't enough: "Volume spikes" is not "Mega Volume".
    if (covered < 1 && !(covered >= 0.5 && nameCovered >= 0.5 && shared >= 2)) continue;
    const score = covered + nameCovered;
    if (!best || score > best.score) best = { template, score };
  }
  return best?.template ?? null;
}

/**
 * Tags, audience and a description to offer for a service, read from its name
 * and the menu heading it sits under. `fallbackKind` is the business-level
 * category (providers.service_category), used when the heading's own name
 * doesn't say ("French tips" is NAILS only because the business is).
 */
export function suggestServiceDetails(input: {
  name: string;
  categoryName: string;
  fallbackKind?: string | null | undefined;
}): ServiceSuggestion {
  const kind = inferCategoryKind(input.categoryName, input.fallbackKind ?? 'OTHER');
  const nameWords = words(input.name);
  const headingWords = words(input.categoryName);
  const plain = normalizeTerm(`${input.name} ${input.categoryName}`);

  const groups = emptyTagGroups();
  const alsoConsider = emptyTagGroups();
  let target = groups;
  // One tag in one group: "bridal" is a style, a technique AND an occasion
  // option, and ticking it three times is noise.
  const add = (group: keyof ServiceTagGroups, tag: string) => {
    if (TAG_GROUP_KEYS.some(g => groups[g].includes(tag) || alsoConsider[g].includes(tag))) return;
    if (target[group].length < MAX_SUGGESTED_PER_GROUP) target[group].push(tag);
  };
  const options = optionsFor(kind);
  const readWords = (from: string[], text: string) => {
    // 1. Any tag whose every word is there: "Slick French" → french, "Boho
    //    Braids" → braids + boho, "Butterfly cut" → butterfly-cut.
    for (const group of TAG_GROUP_KEYS) {
      for (const tag of options[group]) {
        const tagWords = tag.split('-').filter(Boolean);
        if (tagWords.length > 0 && tagWords.every(w => hasWord(from, w))) add(group, tag);
      }
    }
    // 2. Words that mean a tag without containing it ("Pixi Cut" → haircut).
    for (const hint of TAG_HINTS) {
      if (hint.kind === kind && hint.words.test(text)) add(hint.group, hint.tag);
    }
  };

  // The name first. The heading's tags are ticked only when the name gives
  // none: "Pink princess" under "Soft Glam" is soft glam, but "Dermaplaning"
  // under "Dermal Fillers" is not a filler, so there it's only offered.
  readWords(nameWords, normalizeTerm(input.name));
  const nameSaidSomething = !hasNoTags(groups);

  // 3. The nearest template's own tags and description.
  const template = nearestTemplate(kind, nameWords, headingWords);
  if (template) {
    for (const tag of template.techniqueTags ?? []) add('techniqueTags', tag);
    for (const tag of template.styleTags ?? []) add('styleTags', tag);
    for (const tag of template.outcomeTags ?? []) add('outcomeTags', tag);
    for (const tag of template.occasionTags ?? []) add('occasionTags', tag);
    for (const tag of template.trendNames ?? []) add('trendNames', tag);
  }

  if (nameSaidSomething) target = alsoConsider;
  readWords(headingWords, normalizeTerm(input.categoryName));

  const audience = AUDIENCE_PATTERNS.find(a => a.words.test(plain))?.audience ?? '';

  return {
    ...groups,
    alsoConsider,
    kind,
    audience,
    description: template?.description ?? null,
    templateName: template?.name ?? null,
  };
}

export function emptyTagGroups(): ServiceTagGroups {
  return { styleTags: [], techniqueTags: [], outcomeTags: [], occasionTags: [], trendNames: [] };
}

/** True when a service carries no tag in any group. */
export function hasNoTags(service: Partial<Record<keyof ServiceTagGroups, string[] | null | undefined>>): boolean {
  return TAG_GROUP_KEYS.every(group => (service[group]?.length ?? 0) === 0);
}

/** Every tag in `extra` not already in `base`, group by group. */
export function mergeTagGroups(base: ServiceTagGroups, extra: ServiceTagGroups): ServiceTagGroups {
  const out = { ...base };
  for (const group of TAG_GROUP_KEYS) {
    out[group] = [...base[group], ...extra[group].filter(t => !base[group].includes(t))];
  }
  return out;
}

// ─── Description quality ────────────────────────────────────────────────────

export type DescriptionProblem = 'missing' | 'too-short' | 'repeats-name' | 'looks-like-typing' | null;

/** Shorter than this reads as a label, not a description ("Any colour"). */
export const MIN_DESCRIPTION_LENGTH = 20;

const VOWELS = /[aeiouy]/;

/** A word nobody typed on purpose: 8+ letters with 5+ consonants in a row, or
 *  barely any vowels ("Atzgzgkstkk…", "uyfujmklvjmlkjv"). Real words max out
 *  around four ("lengths", "strengthening"). */
function isKeyboardMash(word: string): boolean {
  if (word.length < 8 || /\d/.test(word)) return false;
  let run = 0;
  let longest = 0;
  let vowels = 0;
  for (const ch of word) {
    if (VOWELS.test(ch)) { vowels++; run = 0; } else { run++; longest = Math.max(longest, run); }
  }
  return longest >= 5 || vowels / word.length < 0.2;
}

/**
 * What, if anything, stops a description doing its job: telling a client what
 * they're booking, and giving Search words beyond the name. Null = fine.
 */
export function descriptionProblem(description: string | null | undefined, name: string): DescriptionProblem {
  const text = (description ?? '').trim();
  if (!text) return 'missing';
  if (tokenize(text).some(isKeyboardMash)) return 'looks-like-typing';
  const nameWords = words(name);
  const descWords = words(text);
  if (descWords.length > 0 && descWords.every(w => hasWord(nameWords, w))) return 'repeats-name';
  if (text.length < MIN_DESCRIPTION_LENGTH) return 'too-short';
  return null;
}

/** What to tell the provider, per problem. Written for the provider, not as
 *  an error code: these show inline under the description field. */
export const DESCRIPTION_PROBLEM_COPY: Record<Exclude<DescriptionProblem, null>, string> = {
  'missing': 'Add a short description. It’s what clients read before booking, and what Search reads too.',
  'too-short': 'Say a little more in the description — a sentence about what’s included.',
  'repeats-name': 'The description only repeats the name. Say what’s included or what to expect.',
  'looks-like-typing': 'The description looks like stray typing. Write a sentence about what’s included.',
};
