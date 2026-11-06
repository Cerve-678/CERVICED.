import type { ServiceCategory } from '../../types/database';

// ── Example packs ────────────────────────────────────────────────────────────
// Starting points a provider edits before saving — never sent as they are.
// Same shape as the intake-form templates (src/features/intake-forms/
// formTemplates.ts): each example belongs to one service type, a provider is
// offered only the types they declared, and their own service names are used
// afterwards only to rank and to pre-pick service chips.
//
// Copy rules (health-adjacent, not lawyer-reviewed — see
// LEGAL-COMPLIANCE-NOTES.md): plain and non-medical; anything about patch
// tests, allergies, skin or pregnancy is a [bracketed] blank the provider
// fills in, never advice written by CERVICED; no money lines (deposits,
// balances, refunds); no promises about results.

export interface PackTemplate {
  id: string;
  category: ServiceCategory;
  /** Small caps label on the example card. */
  kind: string;
  title: string;
  /** Matched against the provider's service names, both to rank this example
   *  and to pre-pick the service chips it attaches to. Empty = a general
   *  example that suits every service (e.g. What to bring). */
  keywords: string[];
  content: string;
}

const PATCH_TEST = '[Add your patch test requirements here: when it should be done and how long before]';
const ALLERGY = '[Add anything clients should tell you before booking, such as allergies or sensitivities]';
const LATE = [
  "Please message me as soon as you know you're running late so I can plan the rest of the day.",
  'My booking policy covers lateness and rescheduling: [add where clients can find your policy]',
];

const H = {
  before: 'BEFORE YOUR APPOINTMENT',
  after: 'AFTERCARE',
  bring: 'WHAT TO BRING',
  last: 'MAKING IT LAST',
  arrive: 'ARRIVING',
  late: 'RUNNING LATE',
} as const;

function t(
  id: string,
  category: ServiceCategory,
  kind: string,
  title: string,
  keywords: string[],
  heading: keyof typeof H,
  lines: string[],
): PackTemplate {
  return { id, category, kind, title, keywords, content: `${H[heading]}\n${lines.join('\n')}` };
}

const TEMPLATES: PackTemplate[] = [
  // ── Hair ──
  t('hair-colour-after', 'HAIR', 'Aftercare', 'Colour aftercare', ['colour', 'color', 'highlight', 'balayage', 'toner', 'gloss', 'bleach'], 'after', [
    'Wait 48 hours before your first wash if you can.',
    'Use a sulphate-free shampoo and cooler water.',
    'Use a heat protectant before styling.',
  ]),
  t('hair-colour-before', 'HAIR', 'Before your appointment', 'Before your colour appointment', ['colour', 'color', 'highlight', 'balayage', 'cut', 'blow'], 'before', [
    'Come with dry, product-free hair if you can.',
    "Bring photos of colours you love and ones you don't.",
    'Tell me about any colour or treatments in the last year.',
    PATCH_TEST,
  ]),
  t('hair-bring', 'HAIR', 'What to bring', 'What to bring', [], 'bring', [
    'Inspiration photos.',
    "Your usual styling products if you'd like advice on them.",
    "A top that's easy to take off over your head.",
  ]),
  t('hair-silk-press', 'HAIR', 'Silk press', 'Silk press care', ['silk press', 'press', 'blow'], 'after', [
    'Wrap your hair at night with a silk scarf or bonnet.',
    'Keep it away from steam and heavy moisture where you can.',
    'Use a light heat protectant when you restyle.',
  ]),
  t('hair-braids-last', 'HAIR', 'Braids', 'Keeping your braids fresh', ['braid', 'twist', 'cornrow', 'loc', 'knotless'], 'last', [
    'Moisturise your scalp and braids lightly. A little goes a long way.',
    'Wrap your braids at night to cut down on frizz.',
    '[Add how long you suggest keeping them in, and when to book a take-down]',
  ]),
  t('hair-braids-before', 'HAIR', 'Before your appointment', 'Wash & detangle before braids', ['braid', 'twist', 'cornrow', 'knotless', 'wig', 'weave'], 'before', [
    'Come with clean, fully detangled hair, blow-dried if you can.',
    'Skip heavy oils or butters on the day.',
    "Bring the hair you'd like used, if you're supplying your own.",
  ]),

  // ── Nails ──
  t('nails-gel-after', 'NAILS', 'Aftercare', 'Gel & BIAB aftercare', ['gel', 'biab', 'shellac', 'manicure', 'builder'], 'after', [
    'Use cuticle oil once a day.',
    'Wear gloves for cleaning and washing up.',
    "Please don't pick or peel. Book a soak-off instead.",
  ]),
  t('nails-before', 'NAILS', 'Before your appointment', 'Before your nail appointment', ['acrylic', 'infill', 'full set', 'extension', 'gel'], 'before', [
    'Come with clean hands and no lotion on your nails.',
    'If you have product from another salon, tell me when you book so I can allow time to remove it.',
    ALLERGY,
  ]),
  t('nails-bring', 'NAILS', 'What to bring', 'What to bring', [], 'bring', [
    "A photo of the nails you'd like.",
    'Any charms or decorations you want added.',
    'Your phone charged, and time to relax.',
  ]),
  t('nails-infill', 'NAILS', 'Infill timing', 'When to book your infill', ['infill', 'acrylic', 'biab', 'refill'], 'last', [
    'Most people book an infill every [add your usual number] weeks.',
    "Book before your nails grow out too far so there's time to rebalance them.",
  ]),
  t('nails-art', 'NAILS', 'Nail art', 'Getting ready for nail art', ['art', 'design', 'chrome', 'french'], 'before', [
    'Bring a clear photo of the design, and a few backup ideas.',
    'Tell me if you have a favourite colour palette.',
    'Intricate designs can take longer. [Add how you handle extra time]',
  ]),
  t('nails-late', 'NAILS', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Lashes ──
  t('lashes-lift-after', 'LASHES', 'Aftercare', 'Lash Lift aftercare', ['lift', 'tint'], 'after', [
    'Keep your lashes dry for the first 24 hours.',
    'Avoid oil-based products and waterproof mascara for 48 hours.',
    "Brush gently with a clean spoolie. Don't rub or pull.",
  ]),
  t('lashes-before', 'LASHES', 'Before your appointment', 'Before your lash appointment', ['classic', 'volume', 'hybrid', 'full set', 'extension', 'lash'], 'before', [
    'Come with no eye makeup and clean lashes.',
    'Skip oil-based cleanser that morning.',
    'Remove contact lenses before we start, or bring a case.',
    PATCH_TEST,
  ]),
  t('lashes-bring', 'LASHES', 'What to bring', 'What to bring', [], 'bring', [
    'A photo of the look you like.',
    'Your glasses or lens case if you wear them.',
    "Something comfy. You'll be lying down for a while.",
  ]),
  t('lashes-ext-after', 'LASHES', 'Classic & volume', 'Classic and volume aftercare', ['classic', 'volume', 'hybrid', 'full set', 'extension'], 'after', [
    'Keep them dry for the first 24 hours.',
    'Brush gently every day with a clean spoolie.',
    'Use oil-free products around your eyes.',
  ]),
  t('lashes-last', 'LASHES', 'Making it last', 'Getting the most from your lashes', ['fill', 'infill', 'refill'], 'last', [
    'How long your lashes last varies from person to person.',
    'Fills are usually booked every [add your usual number] weeks.',
    "Book before they thin out too much so there's enough to work with.",
  ]),
  t('lashes-late', 'LASHES', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Brows ──
  t('brows-lam-after', 'BROWS', 'Aftercare', 'Lamination aftercare', ['lamination', 'laminat'], 'after', [
    'Keep your brows dry for the first 24 hours.',
    'Avoid makeup and heavy creams on your brows for 24 hours.',
    'Brush them into shape with a clean spoolie each morning.',
  ]),
  t('brows-tint-before', 'BROWS', 'Before your appointment', 'Before your tint', ['tint', 'henna'], 'before', [
    'Come with clean, makeup-free brows.',
    'Bring a photo of the shape and colour you like.',
    PATCH_TEST,
  ]),
  t('brows-bring', 'BROWS', 'What to bring', 'What to bring', [], 'bring', [
    'A photo of the brows you like.',
    'Your usual brow products, so I can see what you use.',
  ]),
  t('brows-wax-after', 'BROWS', 'Wax aftercare', 'After your wax and shape', ['wax', 'shape', 'thread', 'tidy'], 'after', [
    'Avoid heat, steam and heavy makeup on the area for 24 hours.',
    'Keep your hands away from the area so it can settle.',
    '[Add any other advice you give after waxing]',
  ]),
  t('brows-last', 'BROWS', 'Making it last', 'Keeping your brows tidy', ['wax', 'shape', 'thread', 'tidy'], 'last', [
    'Brows usually need a tidy every [add your usual number] weeks.',
    'Try to hold off on plucking between visits so the shape stays even.',
  ]),
  t('brows-late', 'BROWS', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Makeup ──
  t('mua-bridal-trial', 'MUA', 'Before your appointment', 'Preparing for your bridal trial', ['trial', 'bridal'], 'before', [
    'Come with a clean, moisturised face.',
    "Bring photos of looks you love and a few you don't.",
    "Wear a top similar to your outfit's neckline if you can.",
    ALLERGY,
  ]),
  t('mua-before', 'MUA', 'Before your appointment', 'Before your makeup appointment', ['bridal', 'event', 'glam', 'makeup', 'occasion', 'prom'], 'before', [
    'Come with a clean, moisturised face and no makeup.',
    'Have your hair tied back or clipped away from your face.',
    'Eat something first so you feel your best.',
  ]),
  t('mua-bring', 'MUA', 'What to bring', 'What to bring', [], 'bring', [
    "Photos of the look you'd like.",
    'Your outfit or a photo of it.',
    'Any jewellery or accessories that go near your face.',
  ]),
  t('mua-photo', 'MUA', 'Photo day', 'Photo-day tips', ['photo', 'shoot', 'editorial', 'headshot'], 'before', [
    "Tell me what you'll be wearing and where the photos are happening.",
    'Bring a few touch-up basics, like blotting papers and your lip colour.',
    'Allow a little extra time in case anything runs over.',
  ]),
  t('mua-arrive', 'MUA', 'Arriving', 'Where to find me', [], 'arrive', [
    '[Add where to park and how to find the entrance]',
    "If I'm coming to you, please have a clear space with good light and a chair ready.",
    '[Add anything else for home visits]',
  ]),
  t('mua-late', 'MUA', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Aesthetics: blanks only, nothing clinical written by CERVICED ──
  t('aes-consult', 'AESTHETICS', 'Before your appointment', 'Before your consultation', ['consult'], 'before', [
    'Bring a list of what you use on your skin right now.',
    'Come with a clean, makeup-free face if you can.',
    '[Add anything you need to know before a first appointment]',
  ]),
  t('aes-after', 'AESTHETICS', 'Aftercare', 'Aftercare', ['facial', 'peel', 'treatment', 'skin'], 'after', [
    '[Add your aftercare instructions here]',
  ]),
  t('aes-bring', 'AESTHETICS', 'What to bring', 'What to bring', [], 'bring', [
    'A list of the products you use.',
    "Any questions you'd like to ask.",
    "Sunglasses and a hat if you'll be going back outside.",
  ]),
  t('aes-before', 'AESTHETICS', 'Before your appointment', 'Preparing for your appointment', ['facial', 'peel', 'treatment', 'skin'], 'before', [
    '[Add how to prepare, and anything to avoid beforehand]',
    "Let me know about anything you'd like to mention before we begin.",
  ]),
  t('aes-follow-up', 'AESTHETICS', 'Follow-up', 'Booking a follow-up', ['follow', 'review', 'top up', 'top-up'], 'last', [
    '[Add your guidance on follow-up appointments]',
  ]),
  t('aes-late', 'AESTHETICS', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Barbers / men's grooming ──
  t('male-fade', 'MALE', 'Making it last', 'Keeping your fade sharp', ['fade', 'taper', 'cut', 'line'], 'last', [
    'A fade usually looks its best for [add your usual number] weeks.',
    'Book your next one before it grows out too much.',
    'Ask me about a quick tidy between cuts. [Add if you offer them]',
  ]),
  t('male-beard-after', 'MALE', 'Aftercare', 'Beard aftercare', ['beard', 'trim'], 'after', [
    'Use a beard oil or balm each day.',
    'Wash with a gentle beard wash rather than regular shampoo.',
    'Brush or comb it daily to keep the shape.',
  ]),
  t('male-bring', 'MALE', 'What to bring', 'What to bring', [], 'bring', [
    'A photo of the cut you want.',
    "A hat or cap if you'd like to hide the fresh cut on the way home.",
  ]),
  t('male-before', 'MALE', 'Before your appointment', 'Before your appointment', ['fade', 'cut', 'taper', 'trim'], 'before', [
    'Come with clean, dry hair if you can.',
    'Tell me what you want, and how often you like to come in.',
    ALLERGY,
  ]),
  t('male-shave-after', 'MALE', 'Aftercare', 'After your hot towel shave', ['shave', 'towel'], 'after', [
    '[Add your aftercare advice here]',
  ]),
  t('male-late', 'MALE', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Kids ──
  t('kids-before', 'KIDS', 'Before your appointment', 'Preparing your child', ['cut', 'braid', 'hair', 'trim'], 'before', [
    'Tell your child what to expect. A short chat beforehand helps.',
    'A grown-up needs to stay for the whole appointment.',
    'Let me know about anything that helps them feel comfortable.',
    ALLERGY,
  ]),
  t('kids-bring', 'KIDS', 'What to bring', 'What to bring', [], 'bring', [
    'A favourite toy, book or tablet for the wait.',
    'A snack and a drink, if that helps.',
    "A photo of the style you'd like.",
  ]),
  t('kids-braids-after', 'KIDS', 'Aftercare', 'Aftercare for braids', ['braid', 'twist', 'cornrow'], 'after', [
    'Wrap their hair at bedtime to keep the style neat.',
    '[Add how long you suggest keeping them in]',
  ]),
  t('kids-cut-after', 'KIDS', 'Aftercare', 'Aftercare for a haircut', ['cut', 'trim'], 'after', [
    'A gentle brush a few times a week keeps things tidy.',
    'Book their next trim in [add your usual number] weeks.',
  ]),
  t('kids-arrive', 'KIDS', 'Arriving', 'Arriving with little ones', [], 'arrive', [
    'Please arrive a few minutes early so we start calmly.',
    '[Add where to park and where to wait]',
  ]),
  t('kids-late', 'KIDS', 'Running late', 'Running late or rescheduling', [], 'late', LATE),

  // ── Other ──
  t('other-after', 'OTHER', 'Aftercare', 'Aftercare', [], 'after', [
    '[Add your aftercare instructions here]',
    'If you have any questions, message me.',
  ]),
  t('other-before', 'OTHER', 'Before your appointment', 'Before your appointment', [], 'before', [
    '[Add how to prepare]',
    ALLERGY,
  ]),
  t('other-bring', 'OTHER', 'What to bring', 'What to bring', [], 'bring', [
    '[Add what clients should bring]',
  ]),
  t('other-last', 'OTHER', 'Making it last', 'Getting the most from your visit', [], 'last', [
    '[Add your guidance on how long it lasts and when to rebook]',
  ]),
  t('other-arrive', 'OTHER', 'Arriving', 'Arriving for your appointment', [], 'arrive', [
    '[Add where to park and how to find us]',
    "If I'm coming to you, please have a clear space ready.",
  ]),
  t('other-late', 'OTHER', 'Running late', 'Running late or rescheduling', [], 'late', LATE),
];

export function allPackTemplates(): readonly PackTemplate[] {
  return TEMPLATES;
}

// A keyword counts when a word in the text starts with it ("braid" →
// "braids"), not when it's buried mid-word. Same rule as the form templates.
function mentions(text: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
}

/** Examples written for the provider's declared types; a provider with no
 *  recognised type gets the general set. */
export function packTemplatesFor(categories: readonly string[]): PackTemplate[] {
  const owned = TEMPLATES.filter(tpl => categories.includes(tpl.category));
  return owned.length > 0 ? owned : TEMPLATES.filter(tpl => tpl.category === 'OTHER');
}

/**
 * Orders examples for the rail. Two signals:
 * - the provider's own service names, so a lash artist who only does lifts
 *   sees Lash Lift aftercare before Classic and volume aftercare;
 * - what they are typing, so the rail keeps offering something useful
 *   instead of repeating what's already in the box (writing "colour" in the
 *   title brings the colour examples forward).
 * An example whose text is already in the content box (the one just used)
 * drops to the end.
 */
export function rankPackTemplates(
  templates: readonly PackTemplate[],
  serviceNames: readonly string[],
  typed: { title: string; content: string },
): PackTemplate[] {
  const services = serviceNames.join(' ').toLowerCase();
  const typedText = `${typed.title} ${typed.content}`.toLowerCase();
  const typedWords = new Set(words(typedText));
  const content = typed.content.trim();

  return templates
    .map((tpl, index) => {
      const inUse = content.length > 0 && content.includes(tpl.content.split('\n')[1] ?? tpl.content);
      const serviceScore = tpl.keywords.filter(k => mentions(services, k)).length;
      const typedScore =
        tpl.keywords.filter(k => mentions(typedText, k)).length * 2
        + words(`${tpl.title} ${tpl.kind}`).filter(w => typedWords.has(w)).length;
      return { tpl, index, score: inUse ? -100 : serviceScore + typedScore };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ tpl }) => tpl);
}

/** The provider's own services an example should start attached to. A
 *  general example (no keywords) starts on every service, i.e. none picked.
 *  If nothing matches, nothing is picked and the provider chooses. */
export function servicesForTemplate(tpl: PackTemplate, serviceNames: readonly string[]): string[] {
  if (tpl.keywords.length === 0) return [];
  return serviceNames.filter(name => tpl.keywords.some(k => mentions(name.toLowerCase(), k)));
}
