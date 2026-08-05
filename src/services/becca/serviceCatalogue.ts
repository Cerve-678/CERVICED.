// Service keyword catalogue.
//
// Lifted out of enhancedAIChatService.ts's inline blob so it's data, not
// control flow — the resolver picks the LONGEST matching keyword rather than
// whichever happened to be declared first, and an LLM can later be handed this
// same table as the canonical category vocabulary.
//
// Categories must stay in sync with the app's service_category values
// (NAILS, HAIR, LASHES, BROWS, MUA, AESTHETICS).

export interface ServiceEntry {
  /** Omitted for the catch-all category entry. */
  specific?: string;
  keywords: string[];
}

export const SERVICE_CATALOGUE: Record<string, ServiceEntry[]> = {
  NAILS: [
    { specific: "gel manicure", keywords: ["gel", "gel mani", "gel manicure", "shellac"] },
    { specific: "acrylic nails", keywords: ["acrylic", "acrylics", "full set", "tips"] },
    { specific: "dip powder", keywords: ["dip", "dip powder", "sns"] },
    { specific: "pedicure", keywords: ["pedicure", "pedi", "foot spa"] },
    { specific: "manicure", keywords: ["manicure", "mani"] },
    { specific: "nail art", keywords: ["nail art", "nail design", "custom nails"] },
    { specific: "nail repair", keywords: ["broken nail", "nail repair"] },
    { keywords: ["nail", "nails"] },
  ],
  HAIR: [
    { specific: "balayage", keywords: ["balayage", "painted highlights"] },
    { specific: "highlights", keywords: ["highlights", "lowlights", "foils"] },
    { specific: "hair colour", keywords: ["hair colour", "hair color", "dye", "tint", "root touch up"] },
    { specific: "haircut", keywords: ["haircut", "hair cut", "trim", "bang trim", "fringe"] },
    { specific: "blowout", keywords: ["blowout", "blow dry", "blowdry"] },
    { specific: "keratin treatment", keywords: ["keratin", "smoothing", "brazilian blowout"] },
    { specific: "extensions", keywords: ["hair extensions", "weave"] },
    { specific: "updo", keywords: ["updo", "bun", "wedding hair", "formal style"] },
    { keywords: ["hair", "hairdresser", "stylist"] },
  ],
  LASHES: [
    { specific: "classic lashes", keywords: ["classic lashes", "individual lashes"] },
    { specific: "volume lashes", keywords: ["volume lashes", "russian volume", "mega volume"] },
    { specific: "lash lift", keywords: ["lash lift", "lash perm"] },
    { specific: "lash tint", keywords: ["lash tint"] },
    { specific: "lash fill", keywords: ["lash fill", "lash refill", "infill"] },
    { keywords: ["lash", "lashes", "eyelash", "eyelashes"] },
  ],
  BROWS: [
    { specific: "brow shaping", keywords: ["brow shaping", "brow shape", "arch"] },
    { specific: "brow tint", keywords: ["brow tint"] },
    { specific: "microblading", keywords: ["microblading", "microblade", "semi permanent brows"] },
    { specific: "brow lamination", keywords: ["brow lamination", "brow lam", "laminated brows"] },
    { specific: "threading", keywords: ["threading", "thread"] },
    { specific: "brow wax", keywords: ["brow wax", "brow waxing"] },
    { keywords: ["brow", "brows", "eyebrow", "eyebrows"] },
  ],
  MUA: [
    { specific: "bridal makeup", keywords: ["bridal", "wedding makeup", "bride"] },
    { specific: "special event", keywords: ["event makeup", "prom", "party makeup"] },
    { specific: "glam makeup", keywords: ["glam", "full glam", "beat"] },
    { specific: "natural makeup", keywords: ["natural makeup", "soft glam", "no makeup makeup"] },
    { specific: "makeup lesson", keywords: ["makeup lesson", "makeup tutorial"] },
    { keywords: ["makeup", "mua", "make up", "makeup artist"] },
  ],
  AESTHETICS: [
    { specific: "facial", keywords: ["facial", "face treatment"] },
    { specific: "microneedling", keywords: ["microneedling", "needling"] },
    { specific: "chemical peel", keywords: ["chemical peel", "peel"] },
    { specific: "dermaplaning", keywords: ["dermaplaning", "dermaplane"] },
    { specific: "hydrafacial", keywords: ["hydrafacial", "hydra facial"] },
    { keywords: ["aesthetics", "aesthetic", "skin", "skincare"] },
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
};
