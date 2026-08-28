// Service keyword catalogue.
//
// Lifted out of enhancedAIChatService.ts's inline blob so it's data, not
// control flow — the resolver picks the LONGEST matching keyword rather than
// whichever happened to be declared first, and an LLM can later be handed this
// same table as the canonical category vocabulary.
//
// Categories must stay in sync with the app's service_category values — the
// full ServiceCategory union in types/database.ts: NAILS, HAIR, LASHES, BROWS,
// MUA, AESTHETICS, MALE, KIDS and OTHER. Only the first six were listed here
// for a long while, which left Becca unable to resolve "barber", "kids
// haircut" or "waxing" at all — even though MALE and KIDS are live categories
// with their own Home sections (config/homeSections.ts) and their own filter
// tabs. A message naming one resolved no service entity, so the capability
// requiring one could never run and the user got the generic fallback.
//
// Keywords are matched with word-boundary awareness (containsPhrase), so short
// entries like "wax" are safe against "waxwork" but still need care: anything
// that appears as a substring of an unrelated common word belongs in a longer
// phrase instead.

export interface ServiceEntry {
  /** Omitted for the catch-all category entry. */
  specific?: string;
  keywords: string[];
}

export const SERVICE_CATALOGUE: Record<string, ServiceEntry[]> = {
  NAILS: [
    { specific: "gel manicure", keywords: ["gel", "gel mani", "gel manicure", "shellac", "gel polish"] },
    { specific: "acrylic nails", keywords: ["acrylic", "acrylics", "full set", "tips"] },
    { specific: "dip powder", keywords: ["dip", "dip powder", "sns"] },
    { specific: "builder gel", keywords: ["builder gel", "biab", "gel overlay", "overlay"] },
    { specific: "pedicure", keywords: ["pedicure", "pedi", "foot spa", "toes", "toenails"] },
    { specific: "manicure", keywords: ["manicure", "mani"] },
    { specific: "nail art", keywords: ["nail art", "nail design", "custom nails", "chrome nails", "ombre nails"] },
    { specific: "nail extensions", keywords: ["nail extensions", "nail extension"] },
    { specific: "nail infill", keywords: ["infills", "nail infill", "rebalance"] },
    { specific: "nail removal", keywords: ["nail removal", "soak off", "gel removal", "acrylic removal"] },
    { specific: "nail repair", keywords: ["broken nail", "nail repair"] },
    { keywords: ["nail", "nails"] },
  ],
  HAIR: [
    { specific: "balayage", keywords: ["balayage", "painted highlights", "babylights"] },
    { specific: "highlights", keywords: ["highlights", "lowlights", "foils"] },
    { specific: "hair colour", keywords: ["hair colour", "hair color", "dye", "tint", "root touch up", "colour", "toner", "bleach"] },
    { specific: "haircut", keywords: ["haircut", "hair cut", "trim", "bang trim", "fringe", "layers", "cut and finish"] },
    { specific: "blowout", keywords: ["blowout", "blow dry", "blowdry", "wash and blow dry"] },
    { specific: "keratin treatment", keywords: ["keratin", "smoothing", "brazilian blowout"] },
    { specific: "extensions", keywords: ["hair extensions", "weave", "tape ins", "keratin bonds", "wefts"] },
    { specific: "braids", keywords: ["braids", "box braids", "cornrows", "knotless braids", "plaits"] },
    { specific: "locs", keywords: ["locs", "dreadlocks", "dreads", "loc retwist", "retwist"] },
    { specific: "silk press", keywords: ["silk press", "press and curl"] },
    { specific: "wig install", keywords: ["wig", "wig install", "closure", "frontal", "lace front"] },
    { specific: "perm", keywords: ["perm", "curly perm", "relaxer"] },
    { specific: "hair treatment", keywords: ["hair treatment", "olaplex", "deep conditioning", "scalp treatment"] },
    { specific: "updo", keywords: ["updo", "bun", "wedding hair", "formal style", "bridal hair"] },
    { keywords: ["hair", "hairdresser", "stylist", "salon"] },
  ],
  LASHES: [
    { specific: "classic lashes", keywords: ["classic lashes", "individual lashes", "classic set"] },
    { specific: "volume lashes", keywords: ["volume lashes", "russian volume", "mega volume", "volume set"] },
    { specific: "hybrid lashes", keywords: ["hybrid lashes", "hybrid set"] },
    { specific: "lash lift", keywords: ["lash lift", "lash perm", "lvl"] },
    { specific: "lash tint", keywords: ["lash tint"] },
    { specific: "lash fill", keywords: ["lash fill", "lash refill", "infill", "lash infills"] },
    { specific: "lash removal", keywords: ["lash removal", "lash soak off"] },
    { specific: "cluster lashes", keywords: ["cluster lashes", "strip lashes"] },
    { keywords: ["lash", "lashes", "eyelash", "eyelashes"] },
  ],
  BROWS: [
    { specific: "brow shaping", keywords: ["brow shaping", "brow shape", "arch", "brow tidy"] },
    { specific: "brow tint", keywords: ["brow tint", "brow tinting"] },
    { specific: "microblading", keywords: ["microblading", "microblade", "semi permanent brows"] },
    { specific: "brow lamination", keywords: ["brow lamination", "brow lam", "laminated brows"] },
    { specific: "henna brows", keywords: ["henna brows", "henna brow"] },
    { specific: "threading", keywords: ["threading", "thread"] },
    { specific: "brow wax", keywords: ["brow wax", "brow waxing"] },
    { keywords: ["brow", "brows", "eyebrow", "eyebrows"] },
  ],
  MUA: [
    { specific: "bridal makeup", keywords: ["bridal", "wedding makeup", "bride", "bridal trial"] },
    { specific: "special event", keywords: ["event makeup", "prom", "party makeup", "graduation makeup", "birthday makeup"] },
    { specific: "glam makeup", keywords: ["glam", "full glam", "beat", "full face"] },
    { specific: "natural makeup", keywords: ["natural makeup", "soft glam", "no makeup makeup"] },
    { specific: "makeup lesson", keywords: ["makeup lesson", "makeup tutorial", "makeup masterclass"] },
    { specific: "editorial makeup", keywords: ["editorial makeup", "photoshoot makeup", "shoot makeup"] },
    { keywords: ["makeup", "mua", "make up", "makeup artist"] },
  ],
  AESTHETICS: [
    { specific: "facial", keywords: ["facial", "face treatment", "deep cleanse facial"] },
    { specific: "microneedling", keywords: ["microneedling", "needling", "skin needling"] },
    { specific: "chemical peel", keywords: ["chemical peel", "peel"] },
    { specific: "dermaplaning", keywords: ["dermaplaning", "dermaplane"] },
    { specific: "hydrafacial", keywords: ["hydrafacial", "hydra facial"] },
    { specific: "led therapy", keywords: ["led therapy", "led facial", "light therapy"] },
    { specific: "waxing", keywords: ["waxing", "wax", "leg wax", "bikini wax", "hollywood wax", "brazilian wax", "underarm wax", "hair removal"] },
    { specific: "laser hair removal", keywords: ["laser hair removal", "laser removal", "ipl"] },
    { specific: "spray tan", keywords: ["spray tan", "fake tan", "tanning", "sunless tan"] },
    { specific: "massage", keywords: ["massage", "deep tissue", "swedish massage", "sports massage", "back massage"] },
    { specific: "teeth whitening", keywords: ["teeth whitening", "tooth whitening", "whitening"] },
    { specific: "body treatment", keywords: ["body treatment", "body scrub", "body wrap", "lymphatic drainage"] },
    { keywords: ["aesthetics", "aesthetic", "skin", "skincare", "beauty treatment"] },
  ],
  // Live category with its own Home section and filter tab. Barbering
  // vocabulary is deliberately distinct from HAIR's: someone asking for a
  // "fade" or a "beard trim" wants a barber, not a salon stylist.
  MALE: [
    { specific: "barber cut", keywords: ["barber", "barbers", "barbershop", "mens haircut", "men's haircut", "mens cut"] },
    { specific: "fade", keywords: ["fade", "skin fade", "taper fade", "high fade", "low fade", "buzz cut"] },
    { specific: "beard trim", keywords: ["beard", "beard trim", "beard shape", "beard lineup", "hot towel shave", "wet shave", "shave"] },
    { specific: "line up", keywords: ["line up", "lineup", "edge up", "shape up"] },
    { specific: "mens grooming", keywords: ["mens grooming", "men's grooming", "grooming"] },
    { keywords: ["mens", "men's", "male", "for men", "men"] },
  ],
  // Live category with its own Home section and filter tab.
  KIDS: [
    { specific: "kids haircut", keywords: ["kids haircut", "kids hair cut", "childrens haircut", "children's haircut", "child haircut", "toddler haircut", "first haircut"] },
    { specific: "kids nails", keywords: ["kids nails", "childrens nails", "children's nails", "kids manicure"] },
    { specific: "kids braids", keywords: ["kids braids", "childrens braids", "children's braids"] },
    { specific: "kids party", keywords: ["kids party", "childrens party", "children's party", "kids pamper party", "pamper party"] },
    { keywords: ["kids", "kid", "child", "children", "childrens", "children's", "toddler", "my son", "my daughter"] },
  ],
  // The app's catch-all category. Deliberately sparse: only phrasings that
  // clearly mean "a beauty service" without naming one of the categories
  // above, so it never outranks a specific match.
  OTHER: [
    { keywords: ["piercing", "tattoo", "henna", "holistic", "reflexology", "acupuncture"] },
  ],
};

/** Display label for a category, for use in sentences. */
export const CATEGORY_LABELS: Record<string, string> = {
  NAILS: "nails",
  HAIR: "hair",
  LASHES: "lashes",
  BROWS: "brows",
  MUA: "makeup",
  AESTHETICS: "aesthetics",
  MALE: "men's grooming",
  KIDS: "kids' services",
  OTHER: "other services",
};
