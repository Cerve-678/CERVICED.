// Repairs how people actually type, before anything tries to understand it.
//
// Becca's matching is word-boundary exact by design (see `containsPhrase`) —
// that is what stops "tint" matching inside "maintenance". The cost is that a
// single typo or a split word silently costs a capability its match, and the
// user gets the "didn't catch that" fallback for a request Becca can answer
// perfectly well. Two real examples this exists for:
//
//   "i want to do allmond"            → no service resolved at all
//   "is there any one who can do..."  → missed the "anyone who" phrase
//
// Deliberately NOT a spellchecker, and deliberately NOT a lowercaser:
//
//   • A general edit-distance pass maps real provider names onto service
//     words — a provider called "Mani" would become the service "mani" — and
//     the resolver has no way to tell which reading was intended.
//   • `discover.promocode` reads /\b[A-Z0-9]{4,}\b/ off this same string, so
//     folding case would delete the only signal it has.
//
// Every rewrite is therefore an explicit, reviewable pair, and anything not
// listed here passes through untouched.

/**
 * Applied in order. Earlier entries may feed later ones (curly apostrophes
 * are straightened first so the contraction patterns below can assume `'`).
 */
const REWRITES: readonly (readonly [RegExp, string])[] = [
  // ── Punctuation people's keyboards insert for them ──────────────────────
  [/[‘’ʼ]/g, "'"],
  [/[“”]/g, '"'],

  // ── Words that get typed as two ─────────────────────────────────────────
  // "is there any one who can do lashes" — the matcher's "anyone who" phrase
  // never fires while "anyone" is split, even though the intent is exact.
  [/\bany one\b/gi, "anyone"],
  [/\bsome one\b/gi, "someone"],
  [/\bany body\b/gi, "anybody"],
  [/\bsome body\b/gi, "somebody"],
  [/\beye brows?\b/gi, "eyebrows"],
  [/\beye lash(es)?\b/gi, "eyelashes"],
  [/\bhair dresser\b/gi, "hairdresser"],
  [/\bmake-up\b/gi, "makeup"],
  [/\bmicro blading\b/gi, "microblading"],
  [/\bnear by\b/gi, "nearby"],

  // ── How people type in a chat box ───────────────────────────────────────
  [/\bwanna\b/gi, "want to"],
  [/\btryna\b/gi, "trying to"],
  [/\bgonna\b/gi, "going to"],
  [/\bgotta\b/gi, "got to"],
  [/\bcud\b/gi, "could"],
  [/\bpl[sz]\b/gi, "please"],
  [/\bthx\b/gi, "thanks"],
  [/\bsmth\b/gi, "something"],
  [/\blookin\b/gi, "looking"],
  [/\blookng\b/gi, "looking"],
  // Standalone shorthand only. "u"/"ur" as whole words are unambiguous;
  // a bare "r" is not (it appears in real names and initials) and is left be.
  [/\bu\b/g, "you"],
  [/\bur\b/gi, "your"],
  // "im looking for nails" — without the apostrophe this is not a word the
  // phrase list contains, and "i am"/"i'm" both already read naturally.
  [/\bim\b/g, "i am"],

  // ── Beauty vocabulary, misspelled ───────────────────────────────────────
  // Scoped to words the service catalogue actually owns, so a wrong guess
  // can only ever mis-resolve within the vocabulary Becca already searches.
  [/\ba(?:ll?mou?nd|mond)\b/gi, "almond"],
  [/\bacr(?:i|yl?)l?ics?\b/gi, "acrylic"],
  [/\bshell?ack?\b/gi, "shellac"],
  [/\bman(?:i|a)c(?:ou|u)re?\b/gi, "manicure"],
  [/\bped(?:i|e)c(?:ou|u)re?\b/gi, "pedicure"],
  [/\bball?[ae]?[iy]?[ae]?ge\b/gi, "balayage"],
  [/\bhi(?:gh)?li(?:gh)?ts\b/gi, "highlights"],
  [/\bker(?:a|e)tin\b/gi, "keratin"],
  [/\bbraides\b/gi, "braids"],
  [/\bcorn ?rows\b/gi, "cornrows"],
  [/\blash(?:e|s)\b/gi, "lashes"],
  [/\bbrow ?lam\b/gi, "brow lamination"],
  [/\bwaxin\b/gi, "waxing"],

  // ── Whitespace ──────────────────────────────────────────────────────────
  [/\s+/g, " "],
];

/**
 * The message as Becca should parse it.
 *
 * The user's own words are never changed in the transcript — this is only
 * what the resolver, the matcher and each capability's own regexes read, so
 * one repair pass serves all three rather than each rediscovering the same
 * typos independently.
 */
export function normalizeAsk(message: string): string {
  let out = message;
  for (const [pattern, replacement] of REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}
