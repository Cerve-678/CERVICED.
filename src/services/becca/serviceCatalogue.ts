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
  /**
   * Words used only to find this in a provider's menu: their service names,
   * service tags and specialities. Never used to read the client's message.
   *
   * A look ("kim k lashes") is what people search on Pinterest and TikTok,
   * but on a provider's menu it is a one-word tag (`kim-k`) or part of a
   * service name ("Kim K Wispy Set"). The message keyword "kim k lashes"
   * can't match either, so the look's own words go here instead.
   *
   * Keep these to the look's own words ("glazed", never "chrome" or "nail
   * art"): the reply says "Checked whose menus include glazed nails", and a
   * general word would let a provider who never mentions the look count.
   */
  menuWords?: string[];
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
    // Looks people search on Pinterest and TikTok — the trend tags providers
    // pick in features/providers/serviceTags.ts. Each one only alongside
    // "nails": "Aura" is a business name, "glazed donut" is a skin look too,
    // and "glazed" and "cat eye" are makeup and lash looks.
    { specific: "glazed nails", keywords: ["glazed nails", "glazed donut nails", "glazed doughnut nails"], menuWords: ["glazed"] },
    { specific: "aura nails", keywords: ["aura nails"], menuWords: ["aura"] },
    { specific: "cat eye nails", keywords: ["cat eye nails", "velvet nails", "magnetic nails"], menuWords: ["cat eye", "velvet", "magnetic"] },
    { specific: "milky nails", keywords: ["milky nails", "milky white nails", "milk bath nails"], menuWords: ["milky", "milk bath"] },
    { specific: "christmas nails", keywords: ["christmas nails", "xmas nails", "festive nails"], menuWords: ["christmas", "xmas", "festive"] },
    { specific: "new years nails", keywords: ["new years nails", "new year nails", "new year's nails", "nye nails"], menuWords: ["new year", "nye"] },
    { specific: "winter nails", keywords: ["winter nails"], menuWords: ["winter"] },
    // Shapes are how people name what they want — "i want to do almond" is a
    // complete request to a nail tech. They carry NO `specific`, on purpose:
    // `specific` is matched against real service names elsewhere (see
    // discover.provider_services), and no provider lists "almond" as a
    // bookable service, so claiming one would search for a row that cannot
    // exist. The shape resolves the category; the provider's own menu names
    // the service.
    //
    // Bare "square"/"round" are left out — too common in ordinary sentences
    // to be safe as standalone keywords. "squoval", "coffin", "ballerina" and
    // "stiletto" have no competing everyday meaning in a booking request.
    {
      keywords: [
        "almond nails", "coffin nails", "ballerina nails", "stiletto nails",
        "square nails", "round nails", "oval nails", "squoval nails",
        "almond", "coffin", "ballerina", "stiletto", "squoval",
      ],
    },
    {
      keywords: [
        "nail", "nails", "nail salon", "nail salons",
        "nail tech", "nail techs", "nail technician", "nail technicians",
        "nail artist", "nail artists",
      ],
    },
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
    {
      keywords: [
        "hair", "salon", "salons",
        "hairdresser", "hairdressers", "stylist", "stylists",
        "hair stylist", "hair stylists", "braider", "braiders",
        "colourist", "colourists", "colorist", "colorists",
      ],
    },
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
    // Looks, as for nails above. Each one only alongside "lashes" or "set":
    // "wispy bangs", "wet look hair", "doll eye makeup" and "kim k glam" are
    // hair and makeup asks, and "fox eye" and "butterfly" are a brow look
    // and a haircut. "wispies" and "squirrel" are the bare words only lash
    // techs use.
    // "doll eyelashes" is how "doll eye lashes" reaches the resolver, since
    // the ask normaliser joins "eye lashes".
    { specific: "wispy lashes", keywords: ["wispy lashes", "wispy lash", "wispy set", "wispies"], menuWords: ["wispy", "wispies"] },
    { specific: "kim k lashes", keywords: ["kim k lashes", "kim k lash", "kim k set", "kardashian lashes"], menuWords: ["kim k", "kardashian"] },
    { specific: "doll eye lashes", keywords: ["doll eye lashes", "doll eyelashes", "doll eye lash", "doll eye set"], menuWords: ["doll eye"] },
    { specific: "anime lashes", keywords: ["anime lashes", "anime lash", "manga lashes", "manga lash"], menuWords: ["anime", "manga"] },
    { specific: "wet look lashes", keywords: ["wet look lashes", "wet look lash", "wet set lashes"], menuWords: ["wet look", "wet set"] },
    { specific: "fox eye lashes", keywords: ["fox eye lashes", "fox eyelashes", "fox eye lash"], menuWords: ["fox eye"] },
    { specific: "butterfly lashes", keywords: ["butterfly lashes"], menuWords: ["butterfly"] },
    // "cat eye" is a lash map as well as a nail finish ("wispy cat eye" is a
    // top Pinterest lash search), so the lash look needs "lashes" or "set".
    { specific: "cat eye lashes", keywords: ["cat eye lashes", "cat eyelashes", "cat eye lash", "cat eye set", "wispy cat eye"], menuWords: ["cat eye"] },
    { specific: "squirrel lashes", keywords: ["squirrel lashes", "squirrel eyelashes", "squirrel lash", "squirrel set", "squirrel"], menuWords: ["squirrel"] },
    {
      keywords: [
        "lash", "lashes", "eyelash", "eyelashes",
        "lash tech", "lash techs", "lash technician", "lash technicians",
        "lash artist", "lash artists",
      ],
    },
  ],
  BROWS: [
    { specific: "brow shaping", keywords: ["brow shaping", "brow shape", "arch", "brow tidy"] },
    { specific: "brow tint", keywords: ["brow tint", "brow tinting"] },
    { specific: "microblading", keywords: ["microblading", "microblade", "semi permanent brows"] },
    { specific: "brow lamination", keywords: ["brow lamination", "brow lam", "laminated brows", "soap brows", "fluffy brows"] },
    { specific: "powder brows", keywords: ["powder brows", "ombre brows", "ombré brows"], menuWords: ["powder", "ombre"] },
    { specific: "henna brows", keywords: ["henna brows", "henna brow"] },
    { specific: "threading", keywords: ["threading", "thread"] },
    { specific: "brow wax", keywords: ["brow wax", "brow waxing"] },
    {
      keywords: [
        "brow", "brows", "eyebrow", "eyebrows",
        "brow artist", "brow artists", "brow tech", "brow techs",
      ],
    },
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
    {
      keywords: [
        "aesthetics", "aesthetic", "skin", "skincare", "beauty treatment",
        "beautician", "beauticians", "aesthetician", "aestheticians",
        "esthetician", "estheticians",
      ],
    },
  ],
  // Live category with its own Home section and filter tab. Barbering
  // vocabulary is deliberately distinct from HAIR's: someone asking for a
  // "fade" or a "beard trim" wants a barber, not a salon stylist.
  MALE: [
    { specific: "barber cut", keywords: ["barber", "barbers", "barbershop", "barbershops", "mens haircut", "men's haircut", "mens cut"] },
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

/**
 * Everything that counts as a provider's menu naming this service: the
 * service itself, its message keywords, and its menu-only words.
 */
export function menuNeedles(category: string, specific: string): string[] {
  const entry = SERVICE_CATALOGUE[category]?.find((e) => e.specific === specific);
  return [specific, ...(entry?.keywords ?? []), ...(entry?.menuWords ?? [])];
}

/** A look's menu-only words, or none for an ordinary service. */
export function lookMenuWords(category: string, specific: string): string[] {
  return SERVICE_CATALOGUE[category]?.find((e) => e.specific === specific)?.menuWords ?? [];
}

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
